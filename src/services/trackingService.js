import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { extractIP } from '../utils/ipExtractor.js';
import { parseDevice } from '../utils/deviceParser.js';
import { getCountryFromHeaders } from '../utils/countryLookup.js';
import { extractDomain, appendClickParams, replaceMacros, generateClickId } from '../utils/urlGenerator.js';
import { generateOfferErrorPage } from '../utils/errorPage.js';
import offerService from './offerService.js';
import publisherService from './publisherService.js';
import assignmentService from './assignmentService.js';

import { clickQueue, isOverloaded } from '../workers/clickQueue.js';
import redis from '../config/redis.js';

import cacheService from './cacheService.js';

export class TrackingService {
  async trackClick(query, request) {
    // 1. Fail early if system is overloaded (Backpressure)
    // if (isOverloaded()) ... (Redis handles this better, skip for now or keep)

    try {
      const offerId = parseInt(query.offer_id || query.oid);
      const publisherId = parseInt(query.pub_id || query.a);

      // ============================================
      // 1. REDIS: DEDUPLICATION (First Line of Defense)
      // ============================================
      // Fingerprint: IP + UserAgent + OfferID
      // Check if we have seen this Exact Request recently

      const userAgent = request.headers['user-agent'] || '';
      const ip = extractIP(request);
      const dedupeFingerprint = `${ip}:${offerId}:${userAgent.substring(0, 50)}`; // Shorten UA for key

      // isDuplicateClick uses SET NX EX 3. Returns TRUE if duplicate (key existed).
      const isDuplicate = await cacheService.isDuplicateClick(dedupeFingerprint);

      if (isDuplicate) {
        // It's a duplicate! Try to return cached redirect URL
        const cachedRedirect = await cacheService.getDedupeRedirect(dedupeFingerprint);
        if (cachedRedirect) {
          logger.info('Duplicate Click Suppressed (Redis)', { finger: dedupeFingerprint });
          return { redirect: cachedRedirect, clickId: null, duplicate: true };
        }
        // If no cached redirect (rare race), proceed or error? Proceed to be safe.
      }

      // ============================================
      // 2. REDIS: FETCH REFERENCE DATA (Read-Through)
      // ============================================

      const [offer, publisher] = await Promise.all([
        cacheService.getOffer(offerId),
        cacheService.getPublisher(publisherId)
      ]);

      if (!offer) throw new Error('Offer not found');
      if (!publisher) throw new Error('Publisher not found');
      if (publisher.status !== 'active') throw new Error('Publisher is not active');

      const assignment = await cacheService.getAssignment(publisherId, offerId);
      if (!assignment) throw new Error('Assignment not found');

      // ============================================
      // 3. LOGIC: VALIDATION & CALCULATIONS (Zero DB)
      // ============================================

      // Fallback Logic
      let fallbackRedirect = await this.getFallbackRedirect(offer);
      if (!fallbackRedirect) fallbackRedirect = '/error?message=offer_unavailable';

      // Validation
      const offerValidation = offerService.checkOfferValidity(offer);
      if (!offerValidation.valid) {
        return {
          html: generateOfferErrorPage(offerValidation.message, offerValidation.error_type),
          clickId: null
        };
      }

      // ============================================
      // 4. REDIS: CHECK CAPS (Zero DB)
      // ============================================
      // Check Global Offer Caps (Daily/Total Conversions)
      // We READ the current counter from Redis. We do NOT increment here (only on conversion).

      const isDailyCapHit = offer.daily_cap > 0 && !(await cacheService.checkAndIncrementCap(offerId, 'daily', offer.daily_cap, false));
      const isTotalCapHit = offer.total_cap > 0 && !(await cacheService.checkAndIncrementCap(offerId, 'total', offer.total_cap, false));

      if (isDailyCapHit || isTotalCapHit) {
        return await this.applyCapAction(offer, fallbackRedirect);
      }

      // Assignment Caps? (omitted for brevity, can implement similar pattern in CacheService)

      // ============================================
      // 5. GENERATE & PERSIST
      // ============================================

      const clickUuid = generateClickId(36);

      // Parse params
      const deviceInfo = parseDevice(userAgent);
      const country = getCountryFromHeaders(request);
      const referrer = request.headers.referer || '';
      const domain = extractDomain(referrer);

      const redirectUrl = this._buildRedirectUrl(assignment, offer, query, clickUuid);

      // Persist to Redis
      const clickData = {
        click_uuid: clickUuid,
        offer_id: offerId,
        publisher_id: publisherId,
        publisher_offer_id: assignment.id,
        ip: ip,
        user_agent: userAgent,
        referrer: referrer,
        country: country || '',
        domain: domain,
        device_type: deviceInfo.deviceType,
        browser: deviceInfo.browser,
        os: deviceInfo.os,
        os_version: deviceInfo.osVersion,
        device_model: deviceInfo.deviceModel,
        tid: query.tid || query.click_id || '', // Affiliate ID
        rcid: query.rcid || '',
        timestamp: new Date().toISOString()
      };

      const pipeline = redis.pipeline();
      pipeline.hset(`click:${clickUuid}`, clickData);
      pipeline.expire(`click:${clickUuid}`, 1800); // 30m
      pipeline.xadd('stream:clicks', '*', 'id', clickUuid);

      // Cache the valid redirect for the Deduper
      pipeline.setex(`dedupe:redirect:${dedupeFingerprint}`, 3, redirectUrl);

      await pipeline.exec(); // One Network RT

      return {
        redirect: redirectUrl,
        clickId: clickUuid
      };

    } catch (error) {
      logger.error('TrackingService.trackClick error:', error);
      throw error;
    }
  }

  _buildRedirectUrl(assignment, offer, query, clickUuid) {
    let url = assignment.destination_url || offer.offer_url;
    if (offer.status === 'deactivate') url = offer.fallback_url || url;

    url = replaceMacros(url, {
      click_id: clickUuid,
      rcid: query.rcid || '',
      tid: query.tid || '',
    });

    return appendClickParams(url, {
      click_id: clickUuid,
      tid: query.tid || null,
      rcid: query.rcid || null
    });
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
      // Optimized: Use range query instead of DATE() function
      sql = 'SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ? AND created_at >= CURDATE() AND created_at < CURDATE() + INTERVAL 1 DAY';
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
    // Never return offer.offer_url as fallback - only return actual fallback URLs
    if (offer.fallback_url) return offer.fallback_url;
    if (offer.fallback_offer_id) {
      const [rows] = await pool.query('SELECT offer_url FROM offers WHERE id = ? LIMIT 1', [offer.fallback_offer_id]);
      const fb = Array.isArray(rows) ? rows[0] : rows;
      if (fb?.offer_url) return fb.offer_url;
    }
    // If no fallback is available, return null or a default error page
    // Never use the original offer URL as fallback
    return null;
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

      if (publisher.status !== 'active') {
        return { success: false, error: 'Publisher is not active' };
      }

      // Check assignment exists
      const [assignmentRows] = await pool.query(
        'SELECT * FROM publisher_offers WHERE publisher_id = ? AND offer_id = ? AND status = ?',
        [publisherId, offerId, 'active']
      );

      const assignment = Array.isArray(assignmentRows) ? assignmentRows[0] : assignmentRows;
      if (!assignment) {
        return { success: false, error: 'Assignment not found or inactive' };
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
      await this.updateDailyStats(offerId, publisherId, 'impression');

      return { success: true, impUuid };
    } catch (error) {
      logger.error('TrackingService.trackImpression error:', error);
      return { success: false, error: error.message };
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
      dateCondition = 'created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)';
    } else if (duration === 'day') {
      dateCondition = 'created_at >= CURDATE() AND created_at < CURDATE() + INTERVAL 1 DAY';
    } else if (duration === 'week') {
      dateCondition = 'created_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)'; // Approximate, better for indexing
    } else if (duration === 'month') {
      dateCondition = 'created_at >= DATE_FORMAT(NOW() ,\'%Y-%m-01\')';
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
      dateCondition = 'created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)';
    } else if (duration === 'day') {
      dateCondition = 'created_at >= CURDATE() AND created_at < CURDATE() + INTERVAL 1 DAY';
    } else if (duration === 'week') {
      dateCondition = 'created_at >= DATE_SUB(NOW(), INTERVAL 1 WEEK)';
    } else if (duration === 'month') {
      dateCondition = 'created_at >= DATE_FORMAT(NOW() ,\'%Y-%m-01\')';
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

  async updateDailyStats(offerId, publisherId, type) {
    try {
      const today = new Date().toISOString().split('T')[0];

      // Upsert daily stats
      // Upsert daily stats
      if (type === 'click') {
        const [latestClickRows] = await pool.query(
          `SELECT ip FROM clicks 
           WHERE offer_id = ? AND publisher_id = ? 
           ORDER BY created_at DESC LIMIT 1`,
          [offerId, publisherId]
        );

        const latestClick = Array.isArray(latestClickRows) ? latestClickRows[0] : latestClickRows;
        const clickIp = latestClick?.ip || null;

        let isUnique = true;
        if (clickIp) {
          const [countRows] = await pool.query(
            `SELECT COUNT(*) as cnt FROM clicks 
                 WHERE offer_id = ? 
                   AND publisher_id = ? 
                   AND ip = ? 
                   AND created_at >= CURDATE()`,
            [offerId, publisherId, clickIp]
          );
          const cnt = (Array.isArray(countRows) ? countRows[0] : countRows).cnt;
          isUnique = (cnt === 1);
        }

        await pool.query(
          `INSERT INTO daily_offer_stats (offer_id, day, clicks, unique_clicks)
           VALUES (?, CURDATE(), 1, ?)
           ON DUPLICATE KEY UPDATE 
             clicks = daily_offer_stats.clicks + 1,
             unique_clicks = daily_offer_stats.unique_clicks + (CASE WHEN ? = 1 THEN 1 ELSE 0 END),
             updated_at = NOW()`,
          [offerId, isUnique ? 1 : 0, isUnique ? 1 : 0]
        );
      } else if (type === 'impression') {
        await pool.query(
          `INSERT INTO daily_offer_stats (offer_id, day, impressions)
           VALUES (?, CURDATE(), 1)
           ON DUPLICATE KEY UPDATE 
             impressions = daily_offer_stats.impressions + 1,
             updated_at = NOW()`,
          [offerId]
        );
      }
    } catch (error) {
      logger.error('TrackingService.updateDailyStats error:', error);
    }
  }
}

export default new TrackingService();

