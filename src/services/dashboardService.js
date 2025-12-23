import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import offerService from './offerService.js';
import publisherService from './publisherService.js';

export class DashboardService {
  /**
   * Get date boundaries for today, yesterday, and MTD
   */
  getDateBoundaries() {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    return {
      todayStart: today.toISOString().split('T')[0] + ' 00:00:00',
      todayEnd: now.toISOString(),
      yesterdayStart: yesterday.toISOString().split('T')[0] + ' 00:00:00',
      yesterdayEnd: yesterday.toISOString().split('T')[0] + ' 23:59:59',
      monthStart: monthStart.toISOString().split('T')[0] + ' 00:00:00',
    };
  }

  async getDashboardStats() {
    try {
      const dates = this.getDateBoundaries();
      
      // Get conversions (today, yesterday, by status)
      const [conversionsToday] = await pool.query(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
          COALESCE(SUM(amount), 0) as revenue,
          COALESCE(SUM(payout), 0) as payout
        FROM conversions
        WHERE DATE(created_at) = DATE(?)
        `,
        [dates.todayStart]
      );
      
      const [conversionsYesterday] = await pool.query(
        `SELECT COUNT(*) as total
        FROM conversions
        WHERE DATE(created_at) = DATE(?)
        `,
        [dates.yesterdayStart]
      );
      
      // Get clicks (today, yesterday, MTD, unique)
      const [clicksToday] = await pool.query(
        `SELECT 
          COUNT(*) as total,
          COUNT(DISTINCT click_uuid) as unique_clicks
        FROM clicks
        WHERE DATE(created_at) = DATE(?)
        `,
        [dates.todayStart]
      );
      
      const [clicksYesterday] = await pool.query(
        `SELECT COUNT(*) as total
        FROM clicks
        WHERE DATE(created_at) = DATE(?)
        `,
        [dates.yesterdayStart]
      );
      
      const [clicksMTD] = await pool.query(
        `SELECT COUNT(*) as total
        FROM clicks
        WHERE created_at >= ?
        `,
        [dates.monthStart]
      );
      
      // Get impressions (today, MTD)
      const [impressionsToday] = await pool.query(
        `SELECT COUNT(*) as total
        FROM impressions
        WHERE DATE(created_at) = DATE(?)
        `,
        [dates.todayStart]
      );
      
      const [impressionsMTD] = await pool.query(
        `SELECT COUNT(*) as total
        FROM impressions
        WHERE created_at >= ?
        `,
        [dates.monthStart]
      );
      
      // Get revenue (today, yesterday, MTD)
      const [revenueToday] = await pool.query(
        `SELECT 
          COALESCE(SUM(amount), 0) as revenue,
          COALESCE(SUM(payout), 0) as payout
        FROM conversions
        WHERE DATE(created_at) = DATE(?)
        `,
        [dates.todayStart]
      );
      
      const [revenueYesterday] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) as revenue
        FROM conversions
        WHERE DATE(created_at) = DATE(?)
        `,
        [dates.yesterdayStart]
      );
      
      const [revenueMTD] = await pool.query(
        `SELECT 
          COALESCE(SUM(amount), 0) as revenue,
          COALESCE(SUM(payout), 0) as payout
        FROM conversions
        WHERE created_at >= ?
        `,
        [dates.monthStart]
      );
      
      // Calculate conversion rate
      const totalClicksToday = parseInt(clicksToday[0]?.total || 0);
      const totalConversionsToday = parseInt(conversionsToday[0]?.total || 0);
      const conversionRate = totalClicksToday > 0
        ? (totalConversionsToday / totalClicksToday) * 100
        : 0;
      
      // Get offer stats
      const [offerStats] = await pool.query(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'live' THEN 1 ELSE 0 END) as active,
          SUM(CASE WHEN status = 'paused' THEN 1 ELSE 0 END) as paused,
          SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END) as pending
        FROM offers
        WHERE status != 'remove'
        `
      );
      
      // Get publisher stats
      const publisherStats = await publisherService.getStats();
      
      // Get advertiser stats
      const [advertiserStats] = await pool.query(
        `SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
        FROM advertisers
        `
      );
      
      return {
        conversions: {
          total: parseInt(conversionsToday[0]?.total || 0),
          yesterday: parseInt(conversionsYesterday[0]?.total || 0),
          conversion_rate: parseFloat(conversionRate.toFixed(3)),
          approved: parseInt(conversionsToday[0]?.approved || 0),
          pending: parseInt(conversionsToday[0]?.pending || 0),
          rejected: parseInt(conversionsToday[0]?.rejected || 0),
        },
        clicks: {
          total: parseInt(clicksToday[0]?.total || 0),
          yesterday: parseInt(clicksYesterday[0]?.total || 0),
          unique: parseInt(clicksToday[0]?.unique_clicks || 0),
          mtd: parseInt(clicksMTD[0]?.total || 0),
        },
        impressions: {
          total: parseInt(impressionsToday[0]?.total || 0),
          yesterday: 0, // Not tracked per day in current schema
          mtd: parseInt(impressionsMTD[0]?.total || 0),
        },
        revenue: {
          total: parseFloat(revenueToday[0]?.revenue || 0),
          yesterday: parseFloat(revenueYesterday[0]?.revenue || 0),
          mtd: parseFloat(revenueMTD[0]?.revenue || 0),
          profit: parseFloat((revenueToday[0]?.revenue || 0) - (revenueToday[0]?.payout || 0)),
          payout: parseFloat(revenueToday[0]?.payout || 0),
        },
        offers: {
          total: parseInt(offerStats[0]?.total || 0),
          active: parseInt(offerStats[0]?.active || 0),
          paused: parseInt(offerStats[0]?.paused || 0),
          pending: parseInt(offerStats[0]?.pending || 0),
        },
        publishers: {
          total: parseInt(publisherStats.total || 0),
          active: parseInt(publisherStats.active || 0),
          pending: parseInt(publisherStats.pending || 0),
          suspended: parseInt(publisherStats.suspended || 0),
        },
        advertisers: {
          total: parseInt(advertiserStats[0]?.total || 0),
          active: parseInt(advertiserStats[0]?.active || 0),
        },
      };
    } catch (error) {
      logger.error('DashboardService.getDashboardStats error:', error);
      throw error;
    }
  }

  async getTopOffers(filters = {}) {
    try {
      const limit = parseInt(filters.limit || 5);
      const dateFrom = filters.date_from;
      const dateTo = filters.date_to;
      
      // Build query conditionally based on whether dates are provided
      let dateCondition = '';
      const params = [];
      
      if (dateFrom && dateTo) {
        dateCondition = 'AND DATE(conv.created_at) >= DATE(?) AND DATE(conv.created_at) <= DATE(?)';
        params.push(dateFrom, dateTo);
      }
      
      const [rows] = await pool.query(
        `SELECT 
          o.id as offer_id,
          o.name as offer_name,
          COUNT(DISTINCT conv.id) as conversions
        FROM offers o
        LEFT JOIN conversions conv ON conv.offer_id = o.id
          ${dateCondition}
        WHERE o.status != 'remove'
        GROUP BY o.id, o.name
        HAVING conversions > 0
        ORDER BY conversions DESC
        LIMIT ?
        `,
        [...params, limit]
      );
      
      return rows.map(row => ({
        offer_id: row.offer_id.toString(),
        offer_name: row.offer_name,
        conversions: parseInt(row.conversions || 0),
      }));
    } catch (error) {
      logger.error('DashboardService.getTopOffers error:', error);
      throw error;
    }
  }

  async getPerformanceChart(filters = {}) {
    try {
      const dateFrom = filters.date_from || (() => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
      })();
      const dateTo = filters.date_to || new Date().toISOString().split('T')[0];
      const groupBy = filters.group_by || 'day';
      
      let dateGroup, dateSelect;
      if (groupBy === 'week') {
        dateGroup = `DATE_FORMAT(created_at, '%Y-%u')`;
        dateSelect = `DATE_FORMAT(created_at, '%Y-%u')`;
      } else if (groupBy === 'month') {
        dateGroup = `DATE_FORMAT(created_at, '%Y-%m')`;
        dateSelect = `DATE_FORMAT(created_at, '%Y-%m')`;
      } else {
        dateGroup = `DATE(created_at)`;
        dateSelect = `DATE(created_at)`;
      }
      
      // Get clicks by date
      const [clicksRows] = await pool.query(
        `SELECT 
          ${dateSelect} as date_group,
          COUNT(*) as clicks
        FROM clicks
        WHERE DATE(created_at) >= DATE(?)
          AND DATE(created_at) <= DATE(?)
        GROUP BY ${dateGroup}
        ORDER BY date_group ASC
        `,
        [dateFrom, dateTo]
      );
      
      // Get conversions by date
      const [conversionsRows] = await pool.query(
        `SELECT 
          ${dateSelect} as date_group,
          COUNT(*) as conversions
        FROM conversions
        WHERE DATE(created_at) >= DATE(?)
          AND DATE(created_at) <= DATE(?)
        GROUP BY ${dateGroup}
        ORDER BY date_group ASC
        `,
        [dateFrom, dateTo]
      );
      
      // Combine data
      const clicksMap = new Map(clicksRows.map(r => [r.date_group, parseInt(r.clicks || 0)]));
      const conversionsMap = new Map(conversionsRows.map(r => [r.date_group, parseInt(r.conversions || 0)]));
      
      // Get all unique dates
      const allDates = new Set([...clicksMap.keys(), ...conversionsMap.keys()]);
      const sortedDates = Array.from(allDates).sort();
      
      return sortedDates.map(dateGroup => ({
        date: dateGroup,
        clicks: clicksMap.get(dateGroup) || 0,
        conversions: conversionsMap.get(dateGroup) || 0,
      }));
    } catch (error) {
      logger.error('DashboardService.getPerformanceChart error:', error);
      throw error;
    }
  }

  async getTopAffiliates(filters = {}) {
    try {
      const limit = parseInt(filters.limit || 5);
      const dateFrom = filters.date_from || this.getDateBoundaries().monthStart.split(' ')[0];
      const dateTo = filters.date_to || this.getDateBoundaries().todayEnd.split('T')[0];
      
      // Get top affiliates
      const [rows] = await pool.query(
        `SELECT 
          p.id as publisher_id,
          COALESCE(p.company_name, COALESCE(p.first_name, p.email, 'Unknown')) as publisher_name,
          COUNT(DISTINCT conv.id) as conversions
        FROM publishers p
        LEFT JOIN conversions conv ON conv.publisher_id = p.id
          AND DATE(conv.created_at) >= DATE(?)
          AND DATE(conv.created_at) <= DATE(?)
        WHERE p.status != 'suspended'
        GROUP BY p.id, p.company_name, p.first_name, p.email
        HAVING conversions > 0
        ORDER BY conversions DESC
        LIMIT ?
        `,
        [dateFrom, dateTo, limit]
      );
      
      // Get total conversions for all affiliates
      const [totalRows] = await pool.query(
        `SELECT COUNT(DISTINCT conv.id) as total_conversions
        FROM conversions conv
        WHERE DATE(conv.created_at) >= DATE(?)
          AND DATE(conv.created_at) <= DATE(?)
        `,
        [dateFrom, dateTo]
      );
      
      return {
        data: rows.map(row => ({
          publisher_id: parseInt(row.publisher_id),
          publisher_name: row.publisher_name || 'Unknown',
          conversions: parseInt(row.conversions || 0),
        })),
        total_conversions: parseInt(totalRows[0]?.total_conversions || 0),
      };
    } catch (error) {
      logger.error('DashboardService.getTopAffiliates error:', error);
      throw error;
    }
  }

  async getInfoCards() {
    try {
      // Get active offers count
      const [offerRows] = await pool.query(
        `SELECT COUNT(*) as count
        FROM offers
        WHERE status = 'live'
        `
      );
      
      // Get pending affiliates count
      const publisherStats = await publisherService.getStats();
      
      // Get offer requests (placeholder - may need a separate table)
      const offerRequests = 0;
      
      // Account manager info (placeholder - should come from config or admin table)
      const accountManager = {
        name: 'Sukhwinder Pal Singh',
        telegram: '@username',
        skype: 'username',
        email: 'manager@example.com',
        phone: '+1234567890',
      };
      
      // Signup link (placeholder - should come from config)
      const signupLink = 'https://signup.example.com/affiliates-advertisers';
      
      return {
        active_offers: parseInt(offerRows[0]?.count || 0),
        offer_requests: offerRequests,
        pending_affiliates: parseInt(publisherStats.pending || 0),
        account_manager: accountManager,
        signup_link: signupLink,
      };
    } catch (error) {
      logger.error('DashboardService.getInfoCards error:', error);
      throw error;
    }
  }

  async getTopCountries(filters = {}) {
    try {
      const limit = parseInt(filters.limit || 10);
      const dateFrom = filters.date_from || this.getDateBoundaries().monthStart.split(' ')[0];
      const dateTo = filters.date_to || this.getDateBoundaries().todayEnd.split('T')[0];
      const metric = filters.metric || 'conversions';
      
      // Get country stats from clicks and conversions
      const [rows] = await pool.query(
        `SELECT 
          c.country as country_code,
          c.country as country_name,
          COUNT(DISTINCT c.id) as clicks,
          COUNT(DISTINCT conv.id) as conversions,
          COALESCE(SUM(conv.amount), 0) as revenue
        FROM clicks c
        LEFT JOIN conversions conv ON conv.click_uuid = c.click_uuid
          AND DATE(conv.created_at) >= DATE(?)
          AND DATE(conv.created_at) <= DATE(?)
        WHERE DATE(c.created_at) >= DATE(?)
          AND DATE(c.created_at) <= DATE(?)
          AND c.country IS NOT NULL
          AND c.country != ''
        GROUP BY c.country
        ORDER BY ${metric} DESC
        LIMIT ?
        `,
        [dateFrom, dateTo, dateFrom, dateTo, limit]
      );
      
      // Map country codes to names (simplified - should use a proper country lookup)
      const countryNameMap = {
        'US': 'United States',
        'GB': 'United Kingdom',
        'CA': 'Canada',
        'AU': 'Australia',
        'DE': 'Germany',
        'FR': 'France',
        'IT': 'Italy',
        'ES': 'Spain',
        'NL': 'Netherlands',
        'BR': 'Brazil',
        'MX': 'Mexico',
        'IN': 'India',
        'CN': 'China',
        'JP': 'Japan',
        'KR': 'South Korea',
      };
      
      return rows.map(row => ({
        country_code: row.country_code || 'UN',
        country_name: countryNameMap[row.country_code] || row.country_name || row.country_code,
        clicks: parseInt(row.clicks || 0),
        conversions: parseInt(row.conversions || 0),
        revenue: parseFloat(row.revenue || 0),
      }));
    } catch (error) {
      logger.error('DashboardService.getTopCountries error:', error);
      throw error;
    }
  }
}

export default new DashboardService();

