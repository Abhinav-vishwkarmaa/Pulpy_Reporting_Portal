import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import offerService from './offerService.js';

export class SmartlinkService {
  /**
   * Select best offer from smartlink
   */
  async selectBestOffer(smartlinkId, publisherId, context = {}) {
    try {
      const { country, deviceType } = context;

      // Get smartlink
      const [smartlinkRows] = await pool.query('SELECT * FROM smartlinks WHERE id = ? AND is_active = 1', [smartlinkId]);
      const smartlink = Array.isArray(smartlinkRows) ? smartlinkRows[0] : smartlinkRows;

      if (!smartlink) {
        throw new Error('Smartlink not found or inactive');
      }

      // Get offers in smartlink
      const [offerRows] = await pool.query(
        `SELECT so.*, o.* 
         FROM smartlink_offers so
         JOIN offers o ON so.offer_id = o.id
         WHERE so.smartlink_id = ? AND so.is_active = 1 AND o.status = 'live'
         ORDER BY so.priority ASC`,
        [smartlinkId]
      );
      const smartlinkOffers = Array.isArray(offerRows) ? offerRows : [];

      if (smartlinkOffers.length === 0) {
        // Use fallback offer
        if (smartlink.fallback_offer_id) {
          const fallbackOffer = await offerService.findById(smartlink.fallback_offer_id);
          return fallbackOffer?.offer_url || null;
        }
        return null;
      }

      // Filter offers by restrictions
      const candidateOffers = [];
      for (const item of smartlinkOffers) {
        if (await this.checkOfferRestrictions(item, publisherId, context)) {
          // Get performance score
          const score = await this.calculateOfferScore(smartlinkId, item.offer_id, publisherId, smartlink.scoring_algorithm);
          
          if (score >= (item.min_score || 0)) {
            candidateOffers.push({
              offer_id: item.offer_id,
              offer_url: item.offer_url,
              score,
              weight: item.weight || 100,
              priority: item.priority || 1,
            });
          }
        }
      }

      if (candidateOffers.length === 0) {
        // Use fallback
        if (smartlink.fallback_offer_id) {
          const fallbackOffer = await offerService.findById(smartlink.fallback_offer_id);
          return fallbackOffer?.offer_url || null;
        }
        return null;
      }

      // Sort by score and select best
      candidateOffers.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return b.score - a.score; // Higher score is better
      });

      const selectedOffer = candidateOffers[0];

      // Log selection
      await this.logSelection(smartlinkId, null, selectedOffer.offer_id, publisherId, selectedOffer.score, candidateOffers, 'Best score selected');

      return selectedOffer.offer_url;
    } catch (error) {
      logger.error('SmartlinkService.selectBestOffer error:', error);
      return null;
    }
  }

  /**
   * Check offer restrictions
   */
  async checkOfferRestrictions(item, publisherId, context) {
    const { country, deviceType } = context;

    // Check geo restrictions
    if (item.geo_restrictions) {
      const geoRestrictions = typeof item.geo_restrictions === 'string'
        ? JSON.parse(item.geo_restrictions)
        : item.geo_restrictions;

      if (geoRestrictions.allowed && Array.isArray(geoRestrictions.allowed)) {
        if (!geoRestrictions.allowed.includes(country)) return false;
      }
      if (geoRestrictions.blocked && Array.isArray(geoRestrictions.blocked)) {
        if (geoRestrictions.blocked.includes(country)) return false;
      }
    }

    // Check device restrictions
    if (item.device_restrictions) {
      const deviceRestrictions = typeof item.device_restrictions === 'string'
        ? JSON.parse(item.device_restrictions)
        : item.device_restrictions;

      if (deviceRestrictions.allowed && Array.isArray(deviceRestrictions.allowed)) {
        if (!deviceRestrictions.allowed.includes(deviceType)) return false;
      }
    }

    return true;
  }

  /**
   * Calculate offer score based on algorithm
   */
  async calculateOfferScore(smartlinkId, offerId, publisherId, algorithm) {
    try {
      // Get recent performance (last 24 hours)
      const periodStart = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const periodEnd = new Date();

      const [scoreRows] = await pool.query(
        `SELECT * FROM smartlink_scores 
         WHERE smartlink_id = ? AND offer_id = ? 
         AND (publisher_id = ? OR publisher_id IS NULL)
         AND period_start >= ? AND period_end <= ?
         ORDER BY period_start DESC LIMIT 1`,
        [smartlinkId, offerId, publisherId, periodStart, periodEnd]
      );
      const scoreRecord = Array.isArray(scoreRows) ? scoreRows[0] : scoreRows;

      if (scoreRecord && scoreRecord.score > 0) {
        return parseFloat(scoreRecord.score);
      }

      // Calculate from conversions/clicks
      let query = `SELECT 
        COUNT(DISTINCT c.id) as clicks,
        COUNT(DISTINCT conv.id) as conversions,
        COALESCE(SUM(conv.amount), 0) as revenue,
        COALESCE(SUM(conv.payout), 0) as payout
       FROM clicks c
       LEFT JOIN conversions conv ON conv.offer_id = c.offer_id AND conv.publisher_id = c.publisher_id
         AND conv.created_at >= ? AND conv.created_at <= ? AND conv.status = 'approved'
       WHERE c.offer_id = ? AND c.created_at >= ? AND c.created_at <= ?`;
      const params = [periodStart, periodEnd, offerId, periodStart, periodEnd];

      if (publisherId) {
        query += ` AND c.publisher_id = ?`;
        params.push(publisherId);
      }

      const [rows] = await pool.query(query, params);
      const stats = Array.isArray(rows) ? rows[0] : rows;

      const clicks = parseInt(stats.clicks || 0);
      const conversions = parseInt(stats.conversions || 0);
      const revenue = parseFloat(stats.revenue || 0);
      const payout = parseFloat(stats.payout || 0);

      const epc = clicks > 0 ? payout / clicks : 0;
      const cr = clicks > 0 ? (conversions / clicks) * 100 : 0;

      // Calculate score based on algorithm
      let score = 0;
      switch (algorithm) {
        case 'epc':
          score = epc * 1000; // Scale EPC
          break;
        case 'cr':
          score = cr * 10; // Scale CR
          break;
        case 'revenue':
          score = revenue;
          break;
        case 'hybrid':
        default:
          score = (epc * 500) + (cr * 5) + (revenue * 0.1); // Weighted combination
          break;
      }

      // Update score cache
      await this.updateScoreCache(smartlinkId, offerId, publisherId, periodStart, periodEnd, {
        clicks,
        conversions,
        revenue,
        payout,
        epc,
        cr,
        score,
      });

      return Math.max(0, score);
    } catch (error) {
      logger.error('SmartlinkService.calculateOfferScore error:', error);
      return 0;
    }
  }

  /**
   * Update score cache
   */
  async updateScoreCache(smartlinkId, offerId, publisherId, periodStart, periodEnd, stats) {
    try {
      await pool.query(
        `INSERT INTO smartlink_scores (
          smartlink_id, offer_id, publisher_id, period_start, period_end,
          clicks, conversions, revenue, payout, epc, cr, score
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          clicks = VALUES(clicks),
          conversions = VALUES(conversions),
          revenue = VALUES(revenue),
          payout = VALUES(payout),
          epc = VALUES(epc),
          cr = VALUES(cr),
          score = VALUES(score),
          updated_at = NOW()`,
        [
          smartlinkId,
          offerId,
          publisherId || null,
          periodStart,
          periodEnd,
          stats.clicks,
          stats.conversions,
          stats.revenue,
          stats.payout,
          stats.epc,
          stats.cr,
          stats.score,
        ]
      );
    } catch (error) {
      logger.error('SmartlinkService.updateScoreCache error:', error);
    }
  }

  /**
   * Log selection
   */
  async logSelection(smartlinkId, clickId, selectedOfferId, publisherId, score, candidateOffers, reason) {
    try {
      await pool.query(
        `INSERT INTO smartlink_selection_logs (
          click_id, smartlink_id, selected_offer_id, publisher_id,
          selection_score, candidate_offers, selection_reason
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          clickId,
          smartlinkId,
          selectedOfferId,
          publisherId,
          score,
          JSON.stringify(candidateOffers || []),
          reason,
        ]
      );
    } catch (error) {
      logger.error('SmartlinkService.logSelection error:', error);
    }
  }
}

export default new SmartlinkService();
