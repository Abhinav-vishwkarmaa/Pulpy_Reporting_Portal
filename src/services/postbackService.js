import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { extractIP } from '../utils/ipExtractor.js';
import assignmentService from './assignmentService.js';
import offerService from './offerService.js';
import publisherService from './publisherService.js';
import { replaceMacros } from '../utils/urlGenerator.js';
import https from 'https';
import http from 'http';

export class PostbackService {
  async processPostback(query, request) {
    try {
      const { click_id, rcid, amount, status = 'approved' } = query;
      
      if (!click_id && !rcid) {
        throw new Error('Either click_id or rcid is required');
      }
      
      // Find click if click_id provided
      let click = null;
      if (click_id) {
        const [clickRows] = await pool.query(
          'SELECT * FROM clicks WHERE click_uuid = ?',
          [click_id]
        );
        click = Array.isArray(clickRows) ? clickRows[0] : clickRows;
        
        if (!click) {
          throw new Error('Click not found');
        }
      }
      
      // If rcid provided, check for existing conversion (dedupe)
      if (rcid) {
        const [existingRows] = await pool.query(
          'SELECT * FROM conversions WHERE rcid = ? AND offer_id = ?',
          [rcid, click ? click.offer_id : null]
        );
        
        if (existingRows && existingRows.length > 0) {
          return {
            success: true,
            message: 'Conversion already exists (deduplicated)',
            conversion: existingRows[0],
            duplicate: true,
          };
        }
      }
      
      if (!click && !rcid) {
        throw new Error('Cannot process postback without click_id or rcid');
      }
      
      // Get offer and assignment
      let offerId = click ? click.offer_id : null;
      
      // If no offerId from click, try to find it from rcid (check previous conversion or click)
      if (!offerId && rcid) {
        // Try to find from existing conversion
        const [convRows] = await pool.query(
          'SELECT offer_id FROM conversions WHERE rcid = ? LIMIT 1',
          [rcid]
        );
        if (convRows && convRows.length > 0) {
          offerId = convRows[0].offer_id;
        } else {
          // Try to find from click with this rcid
          const [clickRows] = await pool.query(
            'SELECT offer_id FROM clicks WHERE rcid = ? LIMIT 1',
            [rcid]
          );
          if (clickRows && clickRows.length > 0) {
            offerId = clickRows[0].offer_id;
          }
        }
      }
      
      if (!offerId) {
        throw new Error('Offer ID not found. Cannot determine offer from click_id or rcid');
      }
      
      const offer = await offerService.findById(offerId);
      if (!offer) {
        throw new Error('Offer not found');
      }

      // Validate offer is active and not expired before processing conversion
      // Pass checkTimeRestrictions=true for conversions
      const offerValidation = offerService.checkOfferValidity(offer, true);
      if (!offerValidation.valid) {
        return {
          success: false,
          message: offerValidation.message,
          error_type: offerValidation.error_type,
          conversion: null,
          duplicate: false,
        };
      }
      
      const publisherId = click ? click.publisher_id : null;
      const publisherOfferId = click ? click.publisher_offer_id : null;
      
      // Get assignment if available
      let assignment = null;
      if (publisherOfferId) {
        assignment = await assignmentService.findById(publisherOfferId);
      }
      
      // Get payout (use assignment payout_override if available, otherwise offer affiliate_amount)
      let payout = parseFloat(offer.affiliate_amount);
      if (assignment?.payout_override) {
        payout = parseFloat(assignment.payout_override);
      }
      
      // Use provided amount or default to payout
      const conversionAmount = amount ? parseFloat(amount) : payout;
      
      // Determine conversion status based on conversion_approval_percentage
      let finalStatus = status;
      if (assignment?.conversion_approval_percentage !== null && assignment?.conversion_approval_percentage !== undefined) {
        const approvalPercentage = parseFloat(assignment.conversion_approval_percentage);
        // Random percentage check for auto-approval
        const randomValue = Math.random() * 100;
        if (randomValue <= approvalPercentage) {
          finalStatus = 'approved';
        } else {
          finalStatus = 'pending';
        }
      }
      
      // Extract IP
      const ip = extractIP(request);
      
      // Store postback payload
      const postbackPayload = {
        query: query,
        headers: request.headers,
        timestamp: new Date().toISOString(),
      };
      
      // Check assignment-level capping (budget)
      if (assignment && await this.isAssignmentBudgetCapHit(assignment, offerId, publisherId)) {
        const conversionUuid = uuidv4();
        await pool.query(
          `INSERT INTO conversions (
            conversion_uuid, click_uuid, offer_id, publisher_id, publisher_offer_id,
            rcid, status, amount, payout, ip, postback_payload, timestamp, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
          [
            conversionUuid,
            click ? click.click_uuid : null,
            offerId,
            publisherId,
            publisherOfferId,
            rcid || click?.rcid || uuidv4(),
            'rejected_cap',
            0,
            0,
            ip,
            JSON.stringify(postbackPayload),
          ]
        );
        return {
          success: false,
          message: 'Conversion rejected due to assignment budget cap exceeded',
          conversion: null,
          duplicate: false,
        };
      }

      // Check assignment-level capping (conversions)
      if (assignment && await this.isAssignmentConversionCapHit(assignment, offerId, publisherId)) {
        const conversionUuid = uuidv4();
        await pool.query(
          `INSERT INTO conversions (
            conversion_uuid, click_uuid, offer_id, publisher_id, publisher_offer_id,
            rcid, status, amount, payout, ip, postback_payload, timestamp, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
          [
            conversionUuid,
            click ? click.click_uuid : null,
            offerId,
            publisherId,
            publisherOfferId,
            rcid || click?.rcid || uuidv4(),
            'rejected_cap',
            0,
            0,
            ip,
            JSON.stringify(postbackPayload),
          ]
        );
        return {
          success: false,
          message: 'Conversion rejected due to assignment conversion cap exceeded',
          conversion: null,
          duplicate: false,
        };
      }
      
      // Cap checks before inserting conversion (offer-level)
      const capExceeded = await this.isCapExceeded(offer);
      if (capExceeded) {
        // Insert rejected_cap record (no payout, no stats)
        const conversionUuid = uuidv4();
        await pool.query(
          `INSERT INTO conversions (
            conversion_uuid, click_uuid, offer_id, publisher_id, publisher_offer_id,
            rcid, status, amount, payout, ip, postback_payload, timestamp, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
          [
            conversionUuid,
            click ? click.click_uuid : null,
            offerId,
            publisherId,
            publisherOfferId,
            rcid || click?.rcid || uuidv4(),
            'rejected_cap',
            0,
            0,
            ip,
            JSON.stringify(postbackPayload),
          ]
        );

        return {
          success: false,
          message: 'Conversion rejected due to cap exceeded',
          conversion: null,
          duplicate: false,
        };
      }

      // Insert conversion
      const conversionUuid = uuidv4();
      const [insertResult] = await pool.query(
        `INSERT INTO conversions (
          conversion_uuid, click_uuid, offer_id, publisher_id, publisher_offer_id,
          rcid, status, amount, payout, ip, postback_payload, timestamp, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
        [
          conversionUuid,
          click ? click.click_uuid : null,
          offerId,
          publisherId,
          publisherOfferId,
          rcid || click?.rcid || uuidv4(),
          finalStatus,
          conversionAmount,
          payout,
          ip,
          JSON.stringify(postbackPayload),
        ]
      );
      
      const insertId = insertResult.insertId || insertResult[0]?.insertId;
      const [convRows] = await pool.query('SELECT * FROM conversions WHERE id = ?', [insertId]);
      const conversion = Array.isArray(convRows) ? convRows[0] : convRows;
      
      // Update daily stats
      await this.updateDailyStats(offerId, conversionAmount, payout);
      
      // Get publisher for global_postback_url fallback
      let publisher = null;
      if (publisherId) {
        publisher = await publisherService.findById(publisherId);
      }
      
      // Resolve callback URL: assignment.callback_url OR publisher.global_postback_url
      const callbackUrl = assignment?.callback_url || publisher?.global_postback_url;
      
      // Send postback to publisher's callback URL if available
      if (callbackUrl && conversion) {
        await this.sendPublisherPostback(callbackUrl, conversion, click);
      }
      
      return {
        success: true,
        message: 'Conversion recorded successfully',
        conversion,
        duplicate: false,
      };
    } catch (error) {
      // Handle MySQL duplicate key violations
      if (error.code === 'ER_DUP_ENTRY') {
        // Check if it's the click_uuid unique constraint violation
        if (error.message && error.message.includes('uniq_click_uuid')) {
          return {
            success: false,
            message: 'This click has already generated a conversion. One click can only give one conversion.',
            duplicate: false,
            error_type: 'duplicate_click_conversion'
          };
        }
        // Check if it's the rcid + offer_id unique constraint violation
        if (error.message && error.message.includes('uniq_rcid_offer')) {
          return {
            success: true,
            message: 'Conversion already exists (deduplicated by rcid)',
            duplicate: true,
            error_type: 'duplicate_rcid_offer'
          };
        }
        // Generic duplicate entry error
        return {
          success: false,
          message: 'Duplicate entry detected',
          duplicate: true,
          error_type: 'duplicate_entry'
        };
      }

      // Handle other specific errors
      if (error.code === 'ER_NO_REFERENCED_ROW' || error.code === 'ER_NO_REFERENCED_ROW_2') {
        throw new Error('Invalid reference: The specified offer, publisher, or assignment does not exist');
      }

      if (error.code === 'ER_DATA_TOO_LONG') {
        throw new Error('Data too long for one or more fields. Please check your input length.');
      }

      logger.error('PostbackService.processPostback error:', error);
      throw error;
    }
  }
  
  async updateDailyStats(offerId, revenue, payout) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const profit = revenue - payout;
      
      await pool.query(
        `INSERT INTO daily_offer_stats (offer_id, day, conversions, revenue, payout, profit, created_at, updated_at)
         VALUES (?, ?, 1, ?, ?, ?, NOW(), NOW())
         ON DUPLICATE KEY UPDATE 
           conversions = daily_offer_stats.conversions + 1,
           revenue = daily_offer_stats.revenue + VALUES(revenue),
           payout = daily_offer_stats.payout + VALUES(payout),
           profit = daily_offer_stats.profit + VALUES(profit),
           updated_at = NOW()`,
        [offerId, today, revenue, payout, profit]
      );
    } catch (error) {
      logger.error('PostbackService.updateDailyStats error:', error);
    }
  }

  async isAssignmentBudgetCapHit(assignment, offerId, publisherId) {
    if (!assignment.capping_budget_duration || !assignment.capping_budget_amount) {
      return false;
    }

    const duration = assignment.capping_budget_duration;
    const capAmount = parseFloat(assignment.capping_budget_amount);
    if (capAmount <= 0) return false;

    let dateCondition = '';
    if (duration === 'hour') {
      dateCondition = 'HOUR(created_at) = HOUR(NOW()) AND DATE(created_at) = CURDATE()';
    } else if (duration === 'day') {
      dateCondition = 'DATE(created_at) = CURDATE()';
    } else if (duration === 'week') {
      dateCondition = 'YEARWEEK(created_at, 1) = YEARWEEK(NOW(), 1)';
    } else if (duration === 'month') {
      dateCondition = 'YEAR(created_at) = YEAR(NOW()) AND MONTH(created_at) = MONTH(NOW())';
    } else {
      return false;
    }

    const [rows] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) as total_revenue
       FROM conversions
       WHERE offer_id = ? AND publisher_id = ? AND ${dateCondition}`,
      [offerId, publisherId]
    );
    
    const totalRevenue = parseFloat((Array.isArray(rows) ? rows[0] : rows).total_revenue || 0);
    return totalRevenue >= capAmount;
  }

  async isAssignmentConversionCapHit(assignment, offerId, publisherId) {
    if (!assignment.capping_conversions_duration || !assignment.capping_conversions_amount) {
      return false;
    }

    const duration = assignment.capping_conversions_duration;
    const capCount = parseInt(assignment.capping_conversions_amount);
    if (capCount <= 0) return false;

    let dateCondition = '';
    if (duration === 'hour') {
      dateCondition = 'HOUR(created_at) = HOUR(NOW()) AND DATE(created_at) = CURDATE()';
    } else if (duration === 'day') {
      dateCondition = 'DATE(created_at) = CURDATE()';
    } else if (duration === 'week') {
      dateCondition = 'YEARWEEK(created_at, 1) = YEARWEEK(NOW(), 1)';
    } else if (duration === 'month') {
      dateCondition = 'YEAR(created_at) = YEAR(NOW()) AND MONTH(created_at) = MONTH(NOW())';
    } else {
      return false;
    }

    const [rows] = await pool.query(
      `SELECT COUNT(*) as conversion_count
       FROM conversions
       WHERE offer_id = ? AND publisher_id = ? AND ${dateCondition}`,
      [offerId, publisherId]
    );
    
    const count = parseInt((Array.isArray(rows) ? rows[0] : rows).conversion_count || 0);
    return count >= capCount;
  }

  async sendPublisherPostback(callbackUrl, conversion, click) {
    try {
      // Replace macros in callback URL using replaceMacros function
      const url = replaceMacros(callbackUrl, {
        click_id: conversion.click_uuid || click?.click_uuid || '',
        conversion_id: conversion.conversion_uuid || '',
        rcid: conversion.rcid || '',
        payout: conversion.payout?.toString() || '0',
        amount: conversion.amount?.toString() || '0',
        status: conversion.status || 'pending',
      });
      
      // Also replace additional macros that might be used
      let finalUrl = url
        .replace(/{conversion_id}/gi, conversion.conversion_uuid || '')
        .replace(/{CONVERSION_ID}/gi, conversion.conversion_uuid || '')
        .replace(/{payout}/gi, conversion.payout?.toString() || '0')
        .replace(/{PAYOUT}/gi, conversion.payout?.toString() || '0')
        .replace(/{amount}/gi, conversion.amount?.toString() || '0')
        .replace(/{AMOUNT}/gi, conversion.amount?.toString() || '0')
        .replace(/{status}/gi, conversion.status || 'pending')
        .replace(/{STATUS}/gi, conversion.status || 'pending');

      // Send GET request to publisher callback URL (async, fire and forget)
      const urlObj = new URL(finalUrl);
      const client = urlObj.protocol === 'https:' ? https : http;
      
      const req = client.get(finalUrl, { timeout: 5000 }, (res) => {
        // Log success but don't wait
        logger.info(`Postback sent to publisher: ${finalUrl} - Status: ${res.statusCode}`);
        res.on('data', () => {}); // Consume response
        res.on('end', () => {});
      });

      req.on('error', (err) => {
        logger.error(`PostbackService.sendPublisherPostback error for ${finalUrl}:`, err.message);
        // Don't throw - postback failures shouldn't fail the conversion
      });

      req.on('timeout', () => {
        req.destroy();
        logger.warn(`PostbackService.sendPublisherPostback timeout for ${finalUrl}`);
      });

      req.setTimeout(5000);
    } catch (error) {
      logger.error('PostbackService.sendPublisherPostback error:', error);
      // Don't throw - postback failures shouldn't fail the conversion
    }
  }

  /**
   * Validate offer is active and not expired before processing conversion
   * @param {Object} offer - Offer object from database
   * @returns {Object} - { valid: boolean, message: string, error_type: string }
   */
  validateOfferForConversion(offer) {
    // Check offer status
    if (offer.status !== 'live') {
      return {
        valid: false,
        message: `Offer is not active. Current status: ${offer.status}. Only live offers can accept conversions.`,
        error_type: 'offer_not_active'
      };
    }

    const now = new Date();
    const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const currentTime = now.toTimeString().split(' ')[0]; // HH:MM:SS

    // Check if offer has expired (end_date passed)
    if (offer.end_date) {
      const endDate = new Date(offer.end_date);
      endDate.setHours(23, 59, 59, 999); // End of day
      
      if (now > endDate) {
        return {
          valid: false,
          message: `Offer has expired. End date: ${offer.end_date}`,
          error_type: 'offer_expired'
        };
      }
    }

    // Check if offer hasn't started yet (start_date in future)
    if (offer.start_date) {
      const startDate = new Date(offer.start_date);
      startDate.setHours(0, 0, 0, 0); // Start of day
      
      if (now < startDate) {
        return {
          valid: false,
          message: `Offer has not started yet. Start date: ${offer.start_date}`,
          error_type: 'offer_not_started'
        };
      }
    }

    // Check time restrictions if both start_time and end_time are set
    if (offer.start_time && offer.end_time) {
      const startTime = offer.start_time;
      const endTime = offer.end_time;
      
      // Compare times (HH:MM:SS format)
      if (currentTime < startTime || currentTime > endTime) {
        return {
          valid: false,
          message: `Conversion outside allowed time window. Allowed: ${startTime} - ${endTime}, Current: ${currentTime}`,
          error_type: 'offer_time_restricted'
        };
      }
    } else if (offer.start_time) {
      // Only start_time set
      if (currentTime < offer.start_time) {
        return {
          valid: false,
          message: `Conversion before allowed start time. Start time: ${offer.start_time}, Current: ${currentTime}`,
          error_type: 'offer_time_restricted'
        };
      }
    } else if (offer.end_time) {
      // Only end_time set
      if (currentTime > offer.end_time) {
        return {
          valid: false,
          message: `Conversion after allowed end time. End time: ${offer.end_time}, Current: ${currentTime}`,
          error_type: 'offer_time_restricted'
        };
      }
    }

    return {
      valid: true,
      message: 'Offer is valid for conversion',
      error_type: null
    };
  }

  async isCapExceeded(offer) {
    // Total cap
    if (offer.total_cap && offer.total_cap > 0) {
      const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ?', [offer.id]);
      const totalCount = parseInt((Array.isArray(rows) ? rows[0] : rows).cnt || 0);
      if (totalCount >= offer.total_cap) return true;
    }

    const capType = offer.capping_type || 'none';
    if (capType === 'none') return false;

    if (capType === 'daily' && offer.daily_cap && offer.daily_cap > 0) {
      const [rows] = await pool.query(
        'SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ? AND DATE(created_at) = CURDATE()',
        [offer.id]
      );
      const count = parseInt((Array.isArray(rows) ? rows[0] : rows).cnt || 0);
      if (count >= offer.daily_cap) return true;
    }

    if (capType === 'monthly' && offer.monthly_cap && offer.monthly_cap > 0) {
      const [rows] = await pool.query(
        'SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ? AND YEAR(created_at)=YEAR(NOW()) AND MONTH(created_at)=MONTH(NOW())',
        [offer.id]
      );
      const count = parseInt((Array.isArray(rows) ? rows[0] : rows).cnt || 0);
      if (count >= offer.monthly_cap) return true;
    }

    if (capType === 'weekly' && offer.total_cap && offer.total_cap > 0) {
      const [rows] = await pool.query(
        'SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ? AND YEARWEEK(created_at,1)=YEARWEEK(NOW(),1)',
        [offer.id]
      );
      const count = parseInt((Array.isArray(rows) ? rows[0] : rows).cnt || 0);
      if (count >= offer.total_cap) return true;
    }

    return false;
  }
}

export default new PostbackService();

