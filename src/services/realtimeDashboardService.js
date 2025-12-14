import pool from '../db/connection.js';
import logger from '../utils/logger.js';

export class RealtimeDashboardService {
  /**
   * Get real-time stats for a time window
   * Note: In production, this should use Redis for real-time data
   */
  async getRealtimeStats(timeWindow = '5min', filters = {}) {
    try {
      const now = new Date();
      let periodStart;

      switch (timeWindow) {
        case '1min':
          periodStart = new Date(now.getTime() - 60 * 1000);
          break;
        case '5min':
          periodStart = new Date(now.getTime() - 5 * 60 * 1000);
          break;
        case '15min':
          periodStart = new Date(now.getTime() - 15 * 60 * 1000);
          break;
        case '1hour':
          periodStart = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case '1day':
          periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        default:
          periodStart = new Date(now.getTime() - 5 * 60 * 1000);
      }

      let query = '';
      const params = [];

      if (filters.offer_id) {
        query = `SELECT 
          COUNT(DISTINCT c.id) as clicks,
          COUNT(DISTINCT i.id) as impressions,
          COUNT(DISTINCT conv.id) as conversions,
          COALESCE(SUM(conv.amount), 0) as revenue,
          COALESCE(SUM(conv.payout), 0) as payout,
          COALESCE(SUM(conv.amount - conv.payout), 0) as profit
         FROM clicks c
         LEFT JOIN impressions i ON i.offer_id = c.offer_id AND i.publisher_id = c.publisher_id 
           AND i.created_at >= ? AND i.created_at <= ?
         LEFT JOIN conversions conv ON conv.offer_id = c.offer_id AND conv.publisher_id = c.publisher_id
           AND conv.created_at >= ? AND conv.created_at <= ? AND conv.status = 'approved'
         WHERE c.offer_id = ? AND c.created_at >= ? AND c.created_at <= ?`;
        params.push(periodStart, now, periodStart, now, filters.offer_id, periodStart, now);
      } else if (filters.publisher_id) {
        query = `SELECT 
          COUNT(DISTINCT c.id) as clicks,
          COUNT(DISTINCT i.id) as impressions,
          COUNT(DISTINCT conv.id) as conversions,
          COALESCE(SUM(conv.amount), 0) as revenue,
          COALESCE(SUM(conv.payout), 0) as payout,
          COALESCE(SUM(conv.amount - conv.payout), 0) as profit
         FROM clicks c
         LEFT JOIN impressions i ON i.offer_id = c.offer_id AND i.publisher_id = c.publisher_id 
           AND i.created_at >= ? AND i.created_at <= ?
         LEFT JOIN conversions conv ON conv.offer_id = c.offer_id AND conv.publisher_id = c.publisher_id
           AND conv.created_at >= ? AND conv.created_at <= ? AND conv.status = 'approved'
         WHERE c.publisher_id = ? AND c.created_at >= ? AND c.created_at <= ?`;
        params.push(periodStart, now, periodStart, now, filters.publisher_id, periodStart, now);
      } else {
        // Global stats
        query = `SELECT 
          COUNT(DISTINCT c.id) as clicks,
          COUNT(DISTINCT i.id) as impressions,
          COUNT(DISTINCT conv.id) as conversions,
          COALESCE(SUM(conv.amount), 0) as revenue,
          COALESCE(SUM(conv.payout), 0) as payout,
          COALESCE(SUM(conv.amount - conv.payout), 0) as profit
         FROM clicks c
         LEFT JOIN impressions i ON i.created_at >= ? AND i.created_at <= ?
         LEFT JOIN conversions conv ON conv.created_at >= ? AND conv.created_at <= ? AND conv.status = 'approved'
         WHERE c.created_at >= ? AND c.created_at <= ?`;
        params.push(periodStart, now, periodStart, now, periodStart, now);
      }

      const [rows] = await pool.query(query, params);
      const stats = Array.isArray(rows) ? rows[0] : rows;

      const clicks = parseInt(stats.clicks || 0);
      const impressions = parseInt(stats.impressions || 0);
      const conversions = parseInt(stats.conversions || 0);
      const revenue = parseFloat(stats.revenue || 0);
      const payout = parseFloat(stats.payout || 0);
      const profit = parseFloat(stats.profit || 0);

      // Calculate metrics
      const epc = clicks > 0 ? payout / clicks : 0;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const cr = clicks > 0 ? (conversions / clicks) * 100 : 0;

      return {
        time_window: timeWindow,
        period_start: periodStart.toISOString(),
        period_end: now.toISOString(),
        clicks,
        impressions,
        conversions,
        revenue,
        payout,
        profit,
        epc: parseFloat(epc.toFixed(4)),
        ctr: parseFloat(ctr.toFixed(2)),
        cr: parseFloat(cr.toFixed(2)),
      };
    } catch (error) {
      logger.error('RealtimeDashboardService.getRealtimeStats error:', error);
      throw error;
    }
  }

  /**
   * Get top offers by performance
   */
  async getTopOffers(timeWindow = '15min', limit = 10) {
    try {
      const now = new Date();
      let periodStart;

      switch (timeWindow) {
        case '1min':
          periodStart = new Date(now.getTime() - 60 * 1000);
          break;
        case '5min':
          periodStart = new Date(now.getTime() - 5 * 60 * 1000);
          break;
        case '15min':
          periodStart = new Date(now.getTime() - 15 * 60 * 1000);
          break;
        default:
          periodStart = new Date(now.getTime() - 15 * 60 * 1000);
      }

      const [rows] = await pool.query(
        `SELECT 
          o.id, o.name, o.category,
          COUNT(DISTINCT c.id) as clicks,
          COUNT(DISTINCT conv.id) as conversions,
          COALESCE(SUM(conv.amount), 0) as revenue,
          COALESCE(SUM(conv.payout), 0) as payout,
          CASE WHEN COUNT(DISTINCT c.id) > 0 
            THEN COALESCE(SUM(conv.payout), 0) / COUNT(DISTINCT c.id) 
            ELSE 0 END as epc,
          CASE WHEN COUNT(DISTINCT c.id) > 0 
            THEN (COUNT(DISTINCT conv.id) / COUNT(DISTINCT c.id)) * 100 
            ELSE 0 END as cr
         FROM offers o
         LEFT JOIN clicks c ON c.offer_id = o.id AND c.created_at >= ? AND c.created_at <= ?
         LEFT JOIN conversions conv ON conv.offer_id = o.id 
           AND conv.created_at >= ? AND conv.created_at <= ? AND conv.status = 'approved'
         WHERE o.status = 'live'
         GROUP BY o.id, o.name, o.category
         HAVING clicks > 0
         ORDER BY revenue DESC, epc DESC
         LIMIT ?`,
        [periodStart, now, periodStart, now, limit]
      );

      return Array.isArray(rows) ? rows.map(row => ({
        offer_id: row.id,
        offer_name: row.name,
        category: row.category,
        clicks: parseInt(row.clicks || 0),
        conversions: parseInt(row.conversions || 0),
        revenue: parseFloat(row.revenue || 0),
        payout: parseFloat(row.payout || 0),
        epc: parseFloat(row.epc || 0),
        cr: parseFloat(row.cr || 0),
      })) : [];
    } catch (error) {
      logger.error('RealtimeDashboardService.getTopOffers error:', error);
      throw error;
    }
  }

  /**
   * Get top publishers by performance
   */
  async getTopPublishers(timeWindow = '15min', limit = 10) {
    try {
      const now = new Date();
      let periodStart;

      switch (timeWindow) {
        case '1min':
          periodStart = new Date(now.getTime() - 60 * 1000);
          break;
        case '5min':
          periodStart = new Date(now.getTime() - 5 * 60 * 1000);
          break;
        case '15min':
          periodStart = new Date(now.getTime() - 15 * 60 * 1000);
          break;
        default:
          periodStart = new Date(now.getTime() - 15 * 60 * 1000);
      }

      const [rows] = await pool.query(
        `SELECT 
          p.id, p.email, p.company_name,
          COUNT(DISTINCT c.id) as clicks,
          COUNT(DISTINCT conv.id) as conversions,
          COALESCE(SUM(conv.amount), 0) as revenue,
          COALESCE(SUM(conv.payout), 0) as payout,
          CASE WHEN COUNT(DISTINCT c.id) > 0 
            THEN COALESCE(SUM(conv.payout), 0) / COUNT(DISTINCT c.id) 
            ELSE 0 END as epc,
          CASE WHEN COUNT(DISTINCT c.id) > 0 
            THEN (COUNT(DISTINCT conv.id) / COUNT(DISTINCT c.id)) * 100 
            ELSE 0 END as cr
         FROM publishers p
         LEFT JOIN clicks c ON c.publisher_id = p.id AND c.created_at >= ? AND c.created_at <= ?
         LEFT JOIN conversions conv ON conv.publisher_id = p.id 
           AND conv.created_at >= ? AND conv.created_at <= ? AND conv.status = 'approved'
         WHERE p.status = 'active'
         GROUP BY p.id, p.email, p.company_name
         HAVING clicks > 0
         ORDER BY revenue DESC, epc DESC
         LIMIT ?`,
        [periodStart, now, periodStart, now, limit]
      );

      return Array.isArray(rows) ? rows.map(row => ({
        publisher_id: row.id,
        publisher_email: row.email,
        company_name: row.company_name,
        clicks: parseInt(row.clicks || 0),
        conversions: parseInt(row.conversions || 0),
        revenue: parseFloat(row.revenue || 0),
        payout: parseFloat(row.payout || 0),
        epc: parseFloat(row.epc || 0),
        cr: parseFloat(row.cr || 0),
      })) : [];
    } catch (error) {
      logger.error('RealtimeDashboardService.getTopPublishers error:', error);
      throw error;
    }
  }

  /**
   * Update real-time stats cache (called periodically)
   */
  async updateStatsCache(statType, entityId, timeWindow, stats) {
    try {
      const now = new Date();
      let periodStart;

      switch (timeWindow) {
        case '1min':
          periodStart = new Date(now.getTime() - 60 * 1000);
          break;
        case '5min':
          periodStart = new Date(now.getTime() - 5 * 60 * 1000);
          break;
        case '15min':
          periodStart = new Date(now.getTime() - 15 * 60 * 1000);
          break;
        default:
          periodStart = new Date(now.getTime() - 5 * 60 * 1000);
      }

      await pool.query(
        `INSERT INTO realtime_stats_cache (
          stat_type, entity_id, time_window, period_start, period_end,
          clicks, impressions, conversions, revenue, payout, profit,
          epc, ctr, cr, stats_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          clicks = VALUES(clicks),
          impressions = VALUES(impressions),
          conversions = VALUES(conversions),
          revenue = VALUES(revenue),
          payout = VALUES(payout),
          profit = VALUES(profit),
          epc = VALUES(epc),
          ctr = VALUES(ctr),
          cr = VALUES(cr),
          stats_json = VALUES(stats_json),
          updated_at = NOW()`,
        [
          statType,
          entityId || null,
          timeWindow,
          periodStart,
          now,
          stats.clicks || 0,
          stats.impressions || 0,
          stats.conversions || 0,
          stats.revenue || 0,
          stats.payout || 0,
          stats.profit || 0,
          stats.epc || 0,
          stats.ctr || 0,
          stats.cr || 0,
          JSON.stringify(stats.stats_json || {}),
        ]
      );
    } catch (error) {
      logger.error('RealtimeDashboardService.updateStatsCache error:', error);
    }
  }
}

export default new RealtimeDashboardService();
