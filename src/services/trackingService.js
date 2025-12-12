import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { extractIP } from '../utils/ipExtractor.js';
import { parseDevice } from '../utils/deviceParser.js';
import { getCountryFromHeaders } from '../utils/countryLookup.js';
import { extractDomain, appendClickParams } from '../utils/urlGenerator.js';
import offerService from './offerService.js';
import publisherService from './publisherService.js';
import assignmentService from './assignmentService.js';

export class TrackingService {
  async trackClick(query, request) {
    try {
      const offerId = parseInt(query.offer_id);
      const publisherId = parseInt(query.pub_id);
      
      // Validate offer
      const offer = await offerService.findById(offerId);
      if (!offer) {
        throw new Error('Offer not found');
      }
      
      // Validate publisher
      const publisher = await publisherService.findById(publisherId);
      if (!publisher) {
        throw new Error('Publisher not found');
      }
      
      if (publisher.status !== 'active') {
        throw new Error('Publisher is not active');
      }
      
      // Get assignment
      const [assignmentRows] = await pool.query(
        'SELECT * FROM publisher_offers WHERE publisher_id = ? AND offer_id = ? AND status = ?',
        [publisherId, offerId, 'active']
      );
      
      const assignment = Array.isArray(assignmentRows) ? assignmentRows[0] : assignmentRows;
      if (!assignment) {
        throw new Error('Assignment not found or inactive');
      }
      
      // Apply status and capping checks before recording click
      const fallbackRedirect = await this.getFallbackRedirect(offer);

      // Step 1: offer must be live
      if (offer.status !== 'live') {
        return {
          redirect: fallbackRedirect,
          clickId: null,
        };
      }

      // Step 2: total cap
      if (await this.isTotalCapHit(offer)) {
        return await this.applyCapAction(offer, fallbackRedirect);
      }

      // Step 3: capping_type specific
      if (await this.isCappingTypeHit(offer)) {
        return await this.applyCapAction(offer, fallbackRedirect);
      }
      
      // Parse device info
      const userAgent = request.headers['user-agent'] || '';
      const deviceInfo = parseDevice(userAgent);
      
      // Extract IP
      const ip = extractIP(request);
      
      // Get country
      const country = getCountryFromHeaders(request) || null;
      
      // Extract domain from referrer
      const referrer = request.headers.referer || request.headers.referrer || null;
      const domain = extractDomain(referrer);
      
      // Insert click
      const clickUuid = uuidv4();
      const [clickResult] = await pool.query(
        `INSERT INTO clicks (
          click_uuid, offer_id, publisher_id, publisher_offer_id,
          ip, user_agent, referrer, country, domain,
          device_type, browser, os, os_version, device_brand, device_model,
          source_id, device_id, google_id, android_id, rcid, tid,
          timestamp, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW()
        )`,
        [
          clickUuid,
          offerId,
          publisherId,
          assignment.id,
          ip,
          userAgent,
          referrer,
          country,
          domain,
          deviceInfo.deviceType,
          deviceInfo.browser,
          deviceInfo.os,
          deviceInfo.osVersion,
          deviceInfo.deviceBrand,
          deviceInfo.deviceModel,
          query.source_id || null,
          query.device_id || null,
          query.google_id || null,
          query.android_id || null,
          query.rcid || null,
          query.tid || null,
        ]
      );
      
      
      const clickId = clickResult.insertId || clickResult[0]?.insertId;
      const [clickRows] = await pool.query('SELECT id, click_uuid FROM clicks WHERE id = ?', [clickId]);
      const click = Array.isArray(clickRows) ? clickRows[0] : clickRows;
      
      // Determine redirect URL
      let redirectUrl = offer.offer_url;
      
      if (offer.status === 'deactivate') {
        redirectUrl = offer.fallback_url || offer.offer_url;
      }
      
      // Append click parameters
      redirectUrl = appendClickParams(redirectUrl, {
        click_id: click.click_uuid,
        tid: query.tid || null,
        rcid: query.rcid || null,
        source_id: query.source_id || null,
        device_id: query.device_id || null,
        google_id: query.google_id || null,
        android_id: query.android_id || null,
      });
      
      // Update daily stats
      await this.updateDailyStats(offerId, 'click');
      
      return {
        redirect: redirectUrl,
        clickId: click.click_uuid,
      };
    } catch (error) {
      logger.error('TrackingService.trackClick error:', error);
      throw error;
    }
  }
  
  async isTotalCapHit(offer) {
    if (!offer.total_cap || offer.total_cap <= 0) return false;
    const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ?', [offer.id]);
    const count = parseInt((Array.isArray(rows) ? rows[0] : rows).cnt || 0);
    return count >= offer.total_cap;
  }

  async isCappingTypeHit(offer) {
    const capType = offer.capping_type || 'none';
    if (capType === 'none') return false;

    let sql = '';
    const params = [offer.id];

    if (capType === 'daily' && offer.daily_cap != null && offer.daily_cap > 0) {
      sql = 'SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ? AND DATE(created_at) = CURDATE()';
      const [rows] = await pool.query(sql, params);
      const count = parseInt((Array.isArray(rows) ? rows[0] : rows).cnt || 0);
      return count >= offer.daily_cap;
    }

    if (capType === 'monthly' && offer.monthly_cap != null && offer.monthly_cap > 0) {
      sql = 'SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ? AND YEAR(created_at)=YEAR(NOW()) AND MONTH(created_at)=MONTH(NOW())';
      const [rows] = await pool.query(sql, params);
      const count = parseInt((Array.isArray(rows) ? rows[0] : rows).cnt || 0);
      return count >= offer.monthly_cap;
    }

    if (capType === 'weekly' && offer.total_cap != null && offer.total_cap > 0) {
      sql = 'SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ? AND YEARWEEK(created_at,1)=YEARWEEK(NOW(),1)';
      const [rows] = await pool.query(sql, params);
      const count = parseInt((Array.isArray(rows) ? rows[0] : rows).cnt || 0);
      return count >= offer.total_cap;
    }

    return false;
  }

  async applyCapAction(offer, fallbackRedirect) {
    const action = offer.cap_action || 'fallback';
    if (action === 'pause') {
      await pool.query('UPDATE offers SET status = ?, updated_at = NOW() WHERE id = ?', ['paused', offer.id]);
    }
    return {
      redirect: fallbackRedirect,
      clickId: null,
    };
  }

  async getFallbackRedirect(offer) {
    if (offer.fallback_url) return offer.fallback_url;
    if (offer.fallback_offer_id) {
      const [rows] = await pool.query('SELECT offer_url FROM offers WHERE id = ? LIMIT 1', [offer.fallback_offer_id]);
      const fb = Array.isArray(rows) ? rows[0] : rows;
      if (fb?.offer_url) return fb.offer_url;
    }
    return offer.offer_url;
  }
  
  async trackImpression(query, request) {
    try {
      const offerId = parseInt(query.offer_id);
      const publisherId = parseInt(query.pub_id);
      
      // Validate offer
      const offer = await offerService.findById(offerId);
      if (!offer) {
        return { success: false, error: 'Offer not found' };
      }
      
      // Validate publisher
      const publisher = await publisherService.findById(publisherId);
      if (!publisher) {
        return { success: false, error: 'Publisher not found' };
      }
      
      // Extract info
      const ip = extractIP(request);
      const userAgent = request.headers['user-agent'] || '';
      const referrer = request.headers.referer || request.headers.referrer || null;
      
      // Insert impression
      const impUuid = uuidv4();
      await pool.query(
        `INSERT INTO impressions (
          imp_uuid, offer_id, publisher_id, ip, user_agent, referrer, timestamp, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [impUuid, offerId, publisherId, ip, userAgent, referrer]
      );
      
      // Update daily stats
      await this.updateDailyStats(offerId, 'impression');
      
      return { success: true, impUuid };
    } catch (error) {
      logger.error('TrackingService.trackImpression error:', error);
      return { success: false, error: error.message };
    }
  }
  
  async updateDailyStats(offerId, type) {
    try {
      const today = new Date().toISOString().split('T')[0];
      
      // Upsert daily stats
      if (type === 'click') {
        // Unique click: first click from same IP + publisher + offer on same day
        const [uniqRows] = await pool.query(
          `SELECT id FROM clicks 
             WHERE offer_id = ? 
               AND publisher_id = ? 
               AND ip = ? 
               AND DATE(created_at) = ? 
             LIMIT 1`,
          [offerId, assignment?.publisher_id || null, request.ip || null, today]
        );
        const isUnique = !uniqRows || uniqRows.length === 0;

        await pool.query(
          `INSERT INTO daily_offer_stats (offer_id, day, clicks, unique_clicks)
           VALUES (?, ?, 1, ?)
           ON DUPLICATE KEY UPDATE 
             clicks = daily_offer_stats.clicks + 1,
             unique_clicks = daily_offer_stats.unique_clicks + (CASE WHEN ? = 1 THEN 1 ELSE 0 END),
             updated_at = NOW()`,
          [offerId, today, isUnique ? 1 : 0, isUnique ? 1 : 0]
        );
      } else if (type === 'impression') {
        await pool.query(
          `INSERT INTO daily_offer_stats (offer_id, day, impressions)
           VALUES (?, ?, 1)
           ON DUPLICATE KEY UPDATE 
             impressions = daily_offer_stats.impressions + 1,
             updated_at = NOW()`,
          [offerId, today]
        );
      }
    } catch (error) {
      logger.error('TrackingService.updateDailyStats error:', error);
    }
  }
}

export default new TrackingService();

