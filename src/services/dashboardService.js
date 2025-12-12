import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import offerService from './offerService.js';
import publisherService from './publisherService.js';

export class DashboardService {
  async getDashboardStats() {
    try {
      // Get impressions
      const [impressionsRows] = await pool.query(
        'SELECT COUNT(*) as total FROM impressions'
      );
      const totalImpressions = parseInt(impressionsRows[0]?.total || 0);
      
      // Get clicks
      const [clicksRows] = await pool.query(
        'SELECT COUNT(*) as total, COUNT(DISTINCT click_uuid) as unique_clicks FROM clicks'
      );
      const totalClicks = parseInt(clicksRows[0]?.total || 0);
      const uniqueClicks = parseInt(clicksRows[0]?.unique_clicks || 0);
      
      // Get conversions
      const [conversionRows] = await pool.query(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
          COALESCE(SUM(amount), 0) as revenue,
          COALESCE(SUM(payout), 0) as payout
        FROM conversions`
      );
      const totalConversions = parseInt(conversionRows[0]?.total || 0);
      const approvedConversions = parseInt(conversionRows[0]?.approved || 0);
      const revenue = parseFloat(conversionRows[0]?.revenue || 0);
      const payout = parseFloat(conversionRows[0]?.payout || 0);
      const profit = revenue - payout;
      
      // Calculate conversion rate
      const conversionRate = uniqueClicks > 0
        ? (approvedConversions / uniqueClicks) * 100
        : 0;
      
      // Get offer stats
      const offerStats = await offerService.getStats();
      
      // Get publisher stats
      const publisherStats = await publisherService.getStats();
      
      return {
        impressions: {
          total: totalImpressions,
        },
        clicks: {
          total: totalClicks,
          unique: uniqueClicks,
        },
        conversions: {
          total: totalConversions,
          approved: approvedConversions,
          conversion_rate: parseFloat(conversionRate.toFixed(2)),
        },
        revenue: {
          total: revenue,
          payout: payout,
          profit: profit,
        },
        offers: {
          total: parseInt(offerStats.total),
          active: parseInt(offerStats.active),
        },
        publishers: {
          total: parseInt(publisherStats.total),
          active: parseInt(publisherStats.active),
          pending: parseInt(publisherStats.pending),
        },
      };
    } catch (error) {
      logger.error('DashboardService.getDashboardStats error:', error);
      throw error;
    }
  }
}

export default new DashboardService();

