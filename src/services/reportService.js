import pool from '../db/connection.js';
import logger from '../utils/logger.js';

export class ReportService {
  async getSummary(filters = {}) {
    try {
      let query = `
        SELECT 
          COUNT(DISTINCT c.publisher_id) as affiliates,
          COUNT(DISTINCT c.id) as unique_clicks,
          COUNT(DISTINCT i.id) as impressions,
          COUNT(DISTINCT conv.id) as conversions,
          COALESCE(SUM(conv.amount), 0) as revenue,
          COALESCE(SUM(conv.payout), 0) as payout,
          COALESCE(SUM(conv.amount - conv.payout), 0) as profit
        FROM clicks c
        LEFT JOIN impressions i ON i.offer_id = c.offer_id AND i.publisher_id = c.publisher_id
        LEFT JOIN conversions conv ON conv.click_uuid = c.click_uuid
        WHERE 1=1
      `;
      
      const filtersBuild = this.buildWhereClause(filters);
      query += filtersBuild.clause;

      const [rows] = await pool.query(query, filtersBuild.params);
      const summary = rows[0] || {
        affiliates: 0,
        unique_clicks: 0,
        impressions: 0,
        conversions: 0,
        revenue: 0,
        payout: 0,
        profit: 0,
      };
      
      // Calculate conversion rate
      const conversionRate = summary.unique_clicks > 0
        ? (summary.conversions / summary.unique_clicks) * 100
        : 0;
      
      return {
        ...summary,
        conversion_rate: parseFloat(conversionRate.toFixed(2)),
      };
    } catch (error) {
      logger.error('ReportService.getSummary error:', error);
      throw error;
    }
  }
  
  async getDetailed(filters = {}) {
    try {
      const page = parseInt(filters.page || 1);
      const limit = parseInt(filters.limit || 50);
      const offset = (page - 1) * limit;
      
      let query = `
        SELECT 
          c.id as click_id,
          c.click_uuid,
          c.offer_id,
          o.name as offer_name,
          c.publisher_id,
          p.email as publisher_email,
          p.company_name as publisher_company,
          c.ip,
          c.user_agent,
          c.referrer,
          c.country,
          c.region,
          c.city,
          c.isp,
          c.domain,
          c.device_type,
          c.browser,
          c.os,
          c.os_version,
          c.device_brand,
          c.device_model,
          c.source_id,
          c.device_id,
          c.google_id,
          c.android_id,
          c.rcid,
          c.tid,
          c.timestamp as click_timestamp,
          c.created_at as click_created_at,
          conv.id as conversion_id,
          conv.conversion_uuid,
          conv.status as conversion_status,
          conv.amount as conversion_amount,
          conv.payout as conversion_payout,
          conv.timestamp as conversion_timestamp
        FROM clicks c
        LEFT JOIN offers o ON c.offer_id = o.id
        LEFT JOIN publishers p ON c.publisher_id = p.id
        LEFT JOIN conversions conv ON conv.click_uuid = c.click_uuid
        WHERE 1=1
      `;
      
      const countQuery = `
        SELECT COUNT(*) as total
        FROM clicks c
        LEFT JOIN conversions conv ON conv.click_uuid = c.click_uuid
        WHERE 1=1
      `;
      
      // Build WHERE clause for both queries
      const filtersBuild = this.buildWhereClause(filters);
      query += filtersBuild.clause;
      const countQueryFinal = countQuery + filtersBuild.clause;
      
      // Add ordering and pagination
      query += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?';
      const dataParams = [...filtersBuild.params, limit, offset];
      
      // Get total count
      const [countRows] = await pool.query(countQueryFinal, filtersBuild.params);
      const total = parseInt(countRows[0]?.total || 0);
      
      // Get data
      const [rows] = await pool.query(query, dataParams);
      
      return {
        data: rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error('ReportService.getDetailed error:', error);
      throw error;
    }
  }
  
  buildWhereClause(filters) {
    let clause = '';
    const params = [];
    
    if (filters.date_from) {
      clause += ' AND c.created_at >= ?';
      params.push(filters.date_from);
    }
    
    if (filters.date_to) {
      clause += ' AND c.created_at <= ?';
      params.push(filters.date_to);
    }
    
    if (filters.offer_id) {
      clause += ' AND c.offer_id = ?';
      params.push(filters.offer_id);
    }
    
    if (filters.publisher_id) {
      clause += ' AND c.publisher_id = ?';
      params.push(filters.publisher_id);
    }
    
    if (filters.country) {
      clause += ' AND c.country = ?';
      params.push(filters.country);
    }
    
    if (filters.ip) {
      clause += ' AND c.ip = ?';
      params.push(filters.ip);
    }
    
    if (filters.tid) {
      clause += ' AND c.tid = ?';
      params.push(filters.tid);
    }
    
    if (filters.rcid) {
      clause += ' AND (c.rcid = ? OR conv.rcid = ?)';
      params.push(filters.rcid, filters.rcid);
    }
    
    if (filters.device_brand) {
      clause += ' AND c.device_brand = ?';
      params.push(filters.device_brand);
    }
    
    if (filters.os) {
      clause += ' AND c.os = ?';
      params.push(filters.os);
    }
    
    if (filters.browser) {
      clause += ' AND c.browser = ?';
      params.push(filters.browser);
    }
    
    if (filters.referrer) {
      clause += ' AND c.referrer LIKE ?';
      params.push(`%${filters.referrer}%`);
    }
    
    if (filters.source_id) {
      clause += ' AND c.source_id = ?';
      params.push(filters.source_id);
    }
    
    if (filters.google_id) {
      clause += ' AND c.google_id = ?';
      params.push(filters.google_id);
    }
    
    if (filters.android_id) {
      clause += ' AND c.android_id = ?';
      params.push(filters.android_id);
    }
    
    if (filters.hour !== undefined) {
      clause += ' AND HOUR(c.created_at) = ?';
      params.push(filters.hour);
    }
    
    return { clause, params };
  }

  /**
   * Get publisher conversion statistics grouped by offer
   * @param {Object} filters - Filter options (publisher_id, offer_id, date_from, date_to)
   * @returns {Promise<Object>} Publisher conversion statistics
   */
  async getPublisherConversionStats(filters = {}) {
    try {
      let query = `
        SELECT 
          p.id as publisher_id,
          p.email as publisher_email,
          p.company_name as publisher_company,
          p.country as publisher_country,
          o.id as offer_id,
          o.name as offer_name,
          o.category as offer_category,
          COUNT(DISTINCT c.id) as total_clicks,
          COUNT(DISTINCT conv.id) as total_conversions,
          COUNT(DISTINCT CASE WHEN conv.status = 'approved' THEN conv.id END) as approved_conversions,
          COUNT(DISTINCT CASE WHEN conv.status = 'pending' THEN conv.id END) as pending_conversions,
          COUNT(DISTINCT CASE WHEN conv.status = 'rejected' THEN conv.id END) as rejected_conversions,
          COUNT(DISTINCT CASE WHEN conv.status = 'rejected_cap' THEN conv.id END) as rejected_cap_conversions,
          COALESCE(SUM(conv.amount), 0) as total_revenue,
          COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.amount ELSE 0 END), 0) as approved_revenue,
          COALESCE(SUM(conv.payout), 0) as total_payout,
          COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.payout ELSE 0 END), 0) as approved_payout,
          COALESCE(SUM(conv.amount - conv.payout), 0) as total_profit,
          COALESCE(SUM(CASE WHEN conv.status = 'approved' THEN conv.amount - conv.payout ELSE 0 END), 0) as approved_profit
        FROM publishers p
        INNER JOIN publisher_offers po ON p.id = po.publisher_id
        INNER JOIN offers o ON po.offer_id = o.id
        LEFT JOIN clicks c ON c.publisher_id = p.id AND c.offer_id = o.id
        LEFT JOIN conversions conv ON conv.publisher_id = p.id AND conv.offer_id = o.id
        WHERE 1=1
      `;

      const params = [];

      if (filters.publisher_id) {
        query += ' AND p.id = ?';
        params.push(filters.publisher_id);
      }

      if (filters.offer_id) {
        query += ' AND o.id = ?';
        params.push(filters.offer_id);
      }

      if (filters.date_from) {
        query += ' AND conv.created_at >= ?';
        params.push(filters.date_from);
      }

      if (filters.date_to) {
        query += ' AND conv.created_at <= ?';
        params.push(filters.date_to);
      }

      query += `
        GROUP BY p.id, p.email, p.company_name, p.country, o.id, o.name, o.category
        ORDER BY total_conversions DESC, approved_conversions DESC
      `;

      const [rows] = await pool.query(query, params);

      // Calculate conversion rates
      const stats = rows.map(row => {
        const conversionRate = row.total_clicks > 0
          ? (row.total_conversions / row.total_clicks) * 100
          : 0;
        const approvalRate = row.total_conversions > 0
          ? (row.approved_conversions / row.total_conversions) * 100
          : 0;

        return {
          publisher: {
            id: row.publisher_id,
            email: row.publisher_email,
            company_name: row.publisher_company,
            country: row.publisher_country,
          },
          offer: {
            id: row.offer_id,
            name: row.offer_name,
            category: row.offer_category,
          },
          clicks: {
            total: parseInt(row.total_clicks || 0),
          },
          conversions: {
            total: parseInt(row.total_conversions || 0),
            approved: parseInt(row.approved_conversions || 0),
            pending: parseInt(row.pending_conversions || 0),
            rejected: parseInt(row.rejected_conversions || 0),
            rejected_cap: parseInt(row.rejected_cap_conversions || 0),
            conversion_rate: parseFloat(conversionRate.toFixed(2)),
            approval_rate: parseFloat(approvalRate.toFixed(2)),
          },
          revenue: {
            total: parseFloat(row.total_revenue || 0),
            approved: parseFloat(row.approved_revenue || 0),
          },
          payout: {
            total: parseFloat(row.total_payout || 0),
            approved: parseFloat(row.approved_payout || 0),
          },
          profit: {
            total: parseFloat(row.total_profit || 0),
            approved: parseFloat(row.approved_profit || 0),
          },
        };
      });

      return {
        stats,
        summary: {
          total_publishers: new Set(rows.map(r => r.publisher_id)).size,
          total_offers: new Set(rows.map(r => r.offer_id)).size,
          total_combinations: rows.length,
        },
      };
    } catch (error) {
      logger.error('ReportService.getPublisherConversionStats error:', error);
      throw error;
    }
  }
}

export default new ReportService();

