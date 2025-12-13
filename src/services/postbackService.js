import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { extractIP } from '../utils/ipExtractor.js';
import assignmentService from './assignmentService.js';
import offerService from './offerService.js';
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
      const offerId = click ? click.offer_id : null;
      if (!offerId) {
        throw new Error('Offer ID not found');
      }
      
      const offer = await offerService.findById(offerId);
      if (!offer) {
        throw new Error('Offer not found');
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
      
      // Send postback to publisher's callback_url if assignment has one
      if (assignment?.callback_url && conversion) {
        await this.sendPublisherPostback(assignment.callback_url, conversion, click);
      }
      
      return {
        success: true,
        message: 'Conversion recorded successfully',
        conversion,
        duplicate: false,
      };
    } catch (error) {
      if (error.code === '23505') { // Unique violation (rcid + offer_id)
        return {
          success: true,
          message: 'Conversion already exists (deduplicated)',
          duplicate: true,
        };
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
      // Replace macros in callback URL
      let url = callbackUrl
        .replace(/{click_id}/g, conversion.click_uuid || click?.click_uuid || '')
        .replace(/{CLICK_ID}/g, conversion.click_uuid || click?.click_uuid || '')
        .replace(/{conversion_id}/g, conversion.conversion_uuid || '')
        .replace(/{CONVERSION_ID}/g, conversion.conversion_uuid || '')
        .replace(/{rcid}/g, conversion.rcid || '')
        .replace(/{RCID}/g, conversion.rcid || '')
        .replace(/{payout}/g, conversion.payout || '0')
        .replace(/{PAYOUT}/g, conversion.payout || '0')
        .replace(/{amount}/g, conversion.amount || '0')
        .replace(/{AMOUNT}/g, conversion.amount || '0')
        .replace(/{status}/g, conversion.status || 'pending')
        .replace(/{STATUS}/g, conversion.status || 'pending');

      // Send GET request to publisher callback URL (async, fire and forget)
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;
      
      const req = client.get(url, { timeout: 5000 }, (res) => {
        // Log success but don't wait
        logger.info(`Postback sent to publisher: ${url} - Status: ${res.statusCode}`);
        res.on('data', () => {}); // Consume response
        res.on('end', () => {});
      });

      req.on('error', (err) => {
        logger.error(`PostbackService.sendPublisherPostback error for ${url}:`, err.message);
        // Don't throw - postback failures shouldn't fail the conversion
      });

      req.on('timeout', () => {
        req.destroy();
        logger.warn(`PostbackService.sendPublisherPostback timeout for ${url}`);
      });

      req.setTimeout(5000);
    } catch (error) {
      logger.error('PostbackService.sendPublisherPostback error:', error);
      // Don't throw - postback failures shouldn't fail the conversion
    }
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

