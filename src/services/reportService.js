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
}

export default new ReportService();

