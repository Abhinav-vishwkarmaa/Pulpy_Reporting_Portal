import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { extractIP } from '../utils/ipExtractor.js';
import assignmentService from './assignmentService.js';
import offerService from './offerService.js';

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
      
      // Get payout
      let payout = parseFloat(offer.affiliate_model_cost);
      if (publisherOfferId) {
        const assignmentPayout = await assignmentService.getPayout(publisherOfferId);
        if (assignmentPayout) {
          payout = assignmentPayout;
        }
      }
      
      // Use provided amount or default to payout
      const conversionAmount = amount ? parseFloat(amount) : payout;
      
      // Extract IP
      const ip = extractIP(request);
      
      // Store postback payload
      const postbackPayload = {
        query: query,
        headers: request.headers,
        timestamp: new Date().toISOString(),
      };
      
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
          status,
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
}

export default new PostbackService();

