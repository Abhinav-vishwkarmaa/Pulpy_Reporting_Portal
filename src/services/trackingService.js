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

export class TrackingService {
  async trackClick(query, request) {
    // 1. Fail early if system is overloaded (Backpressure)
    if (isOverloaded()) {
      const error = new Error('System overloaded');
      error.statusCode = 429;
      throw error;
    }

    try {
      // Support both standard and alternative parameter names
      // Standard: offer_id, pub_id
      // Alternative: oid (offer), a (affiliate/publisher)
      const offerId = parseInt(query.offer_id || query.oid);
      const publisherId = parseInt(query.pub_id || query.a);

      // Log the parameter mapping for debugging
      logger.info('Tracking parameters:', {
        offer_id: query.offer_id,
        oid: query.oid,
        pub_id: query.pub_id,
        a: query.a,
        resolved_offer_id: offerId,
        resolved_publisher_id: publisherId
      });

      // CACHE: Simple in-memory cache to prevent DB read exhaustion
      const CACHE_TTL = 60000; // 60 seconds
      if (!global.trackingCache) global.trackingCache = new Map();

      const getCached = async (key, fetcher) => {
        const cached = global.trackingCache.get(key);
        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
          return cached.data;
        }
        const data = await fetcher();
        if (data) global.trackingCache.set(key, { data, timestamp: Date.now() });
        return data;
      };

      // Parallelize independent lookups with Cache
      const [offer, publisher] = await Promise.all([
        getCached(`offer:${offerId}`, () => offerService.findById(offerId)),
        getCached(`pub:${publisherId}`, () => publisherService.findById(publisherId))
      ]);

      if (!offer) {
        throw new Error('Offer not found');
      }

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

      // Apply status and capping checks
      let fallbackRedirect = await this.getFallbackRedirect(offer);
      // Provide default fallback if none is configured (prevents redirecting to invalid offer URLs)
      if (!fallbackRedirect) {
        fallbackRedirect = '/error?message=offer_unavailable'; // Default error page
        logger.warn('No fallback URL configured for offer, using default:', { offer_id: offerId });
      }

      // Step 1: Validate offer is live and not expired
      const offerValidation = offerService.checkOfferValidity(offer);
      if (!offerValidation.valid) {
        logger.warn('Click rejected - Offer validation failed:', {
          offer_id: offerId,
          publisher_id: publisherId,
          reason: offerValidation.message,
          error_type: offerValidation.error_type
        });
        // Return HTML error page instead of redirecting
        return {
          html: generateOfferErrorPage(offerValidation.message, offerValidation.error_type),
          clickId: null,
          error: offerValidation.message,
          error_type: offerValidation.error_type
        };
      }

      // Step 2: Check assignment-level capping (budget)
      if (await this.isAssignmentBudgetCapHit(assignment, offerId, publisherId)) {
        return {
          redirect: fallbackRedirect,
          clickId: null,
        };
      }

      // Step 3: Check assignment-level capping (conversions)
      if (await this.isAssignmentConversionCapHit(assignment, offerId, publisherId)) {
        return {
          redirect: fallbackRedirect,
          clickId: null,
        };
      }

      // Step 4: total cap (offer-level)
      if (await this.isTotalCapHit(offer)) {
        return await this.applyCapAction(offer, fallbackRedirect);
      }

      // Step 5: capping_type specific (offer-level)
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

      // ============================================
      // CRITICAL: Generate click_id BEFORE database insert and redirect
      // ============================================
      // This ensures:
      // 1. We have a unique identifier before any external redirect
      // 2. The same click_id can be passed to downstream affiliates
      // 3. We maintain control over click tracking (not dependent on downstream)
      // 4. We can track the full click journey across multiple redirects
      // ============================================

      // ============================================
      // CRITICAL: Always generate NEW click_uuid for internal/platform tracking
      // ============================================
      // The affiliate's provided click_id is stored in 'tid' for postbacks.
      // We NEVER using incoming click_id as our internal click_uuid.

      const clickUuid = generateClickId(36);
      logger.info('Generated new internal click_uuid:', { click_uuid: clickUuid, offer_id: offerId });

      // Check if affiliate provided a click_id (store as tid)
      const affiliateClickId = query.click_id || null;
      // Filter out placeholders
      const tid = (affiliateClickId &&
        affiliateClickId !== '{click_id}' &&
        affiliateClickId !== '<click_id>' &&
        affiliateClickId !== '{CLICK_ID}' &&
        affiliateClickId !== '<CLICK_ID>'
      ) ? affiliateClickId : (query.tid || null);

      // ============================================
      // ASYNC: Push click insert to background queue
      // ============================================

      // ============================================
      // RESTORED LOGIC: Calculate Redirect URL
      // ============================================

      // Re-validate offer before determining redirect URL
      const offerValidationCheck = offerService.checkOfferValidity(offer);
      if (!offerValidationCheck.valid) {
        logger.warn('Click redirect blocked - Offer validation failed before URL determination:', {
          offer_id: offerId,
          publisher_id: publisherId,
          reason: offerValidationCheck.message,
          error_type: offerValidationCheck.error_type
        });
        return {
          html: generateOfferErrorPage(offerValidationCheck.message, offerValidationCheck.error_type),
          clickId: clickUuid,
          error: offerValidationCheck.message,
          error_type: offerValidationCheck.error_type
        };
      }

      // Determine redirect URL using priority: assignment.destination_url OR offer.offer_url
      let redirectUrl = assignment.destination_url || offer.offer_url;

      if (offer.status === 'deactivate') {
        redirectUrl = offer.fallback_url || redirectUrl;
      }

      if (!redirectUrl) {
        throw new Error('No destination URL available for redirect');
      }

      // Replace macros in URL ({click_id}, {rcid}, {tid})
      redirectUrl = replaceMacros(redirectUrl, {
        click_id: clickUuid,
        rcid: query.rcid || '',
        tid: query.tid || '',
      });

      // Append click parameters as query string
      redirectUrl = appendClickParams(redirectUrl, {
        click_id: clickUuid,
        tid: query.tid || null,
        rcid: query.rcid || null,
        source_id: query.source_id || null,
        device_id: query.device_id || null,
        google_id: query.google_id || null,
        android_id: query.android_id || null,
      });

      // Final validation check
      const finalValidation = offerService.checkOfferValidity(offer);
      if (!finalValidation.valid) {
        return {
          html: generateOfferErrorPage(finalValidation.message, finalValidation.error_type),
          clickId: clickUuid,
          error: finalValidation.message,
          error_type: finalValidation.error_type
        };
      }

      const clickTask = {
        sql: `INSERT INTO clicks (
          click_uuid, offer_id, publisher_id, publisher_offer_id,
          ip, user_agent, referrer, country, domain,
          device_type, browser, os, os_version, device_brand, device_model,
          source_id, device_id, google_id, android_id, rcid, tid,
          timestamp, created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW()
        )`,
        params: [
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
          tid, // Storing affiliate's click_id here
        ],
        type: 'insert_click',
        data: { offerId, publisherId }, // Pass data for worker to update stats
        startTime: Date.now()
      };

      // Push to queue (non-blocking)
      clickQueue.push(clickTask);

      // Also trigger daily stats update in background (fire-and-forget)
      // UPDATED: Now handled by the worker queue to respect concurrency.
      // this.updateDailyStats(offerId, publisherId, 'click').catch(err => logger.error('Async stats update failed:', err));

      return {
        redirect: redirectUrl,
        clickId: clickUuid, // Use the generated UUID, we don't need the DB ID anymore for return
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

