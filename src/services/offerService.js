import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export class OfferService {
  async create(data) {
    try {
      // Generate unique URL key
      const urlKey = this.generateUrlKey(data.name);
      // Ensure nullable dates have safe defaults for MySQL
      const startAt = data.start_at || new Date();
      const endAt = data.end_at || null;
      
      const [result] = await pool.query(
        `INSERT INTO offers (
          name, category, advertiser_revenue, affiliate_model_cost,
          start_at, end_at, offer_url, preview_url, capping_per_day, fallback_url,
          status, url_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          data.name,
          data.category,
          data.advertiser_revenue,
          data.affiliate_model_cost,
          startAt,
          endAt,
          data.offer_url,
          data.preview_url || null,
          data.capping_per_day || 0,
          data.fallback_url || null,
          data.status || 'pending',
          urlKey,
        ]
      );
      
      const insertId = result.insertId || result[0]?.insertId;
      const [rows] = await pool.query('SELECT * FROM offers WHERE id = ?', [insertId]);
      return Array.isArray(rows) ? rows[0] : rows;
    } catch (error) {
      logger.error('OfferService.create error:', error);
      throw error;
    }
  }
  
  generateUrlKey(name) {
    // Generate a short unique key from name
    const base = name.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20);
    const unique = uuidv4().substring(0, 8);
    return `${base}-${unique}`;
  }
  
  async findById(id) {
    const [rows] = await pool.query('SELECT * FROM offers WHERE id = ?', [id]);
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async findByIdWithDetails(id) {
    try {
      // Get offer details
      const offer = await this.findById(id);
      if (!offer) {
        return null;
      }

      // Get advertiser details if advertiser_id exists
      let advertiser = null;
      if (offer.advertiser_id) {
        const [advertiserRows] = await pool.query(
          'SELECT * FROM advertisers WHERE id = ?',
          [offer.advertiser_id]
        );
        advertiser = Array.isArray(advertiserRows) ? advertiserRows[0] : advertiserRows;
      }

      // Get assigned publishers (assignments)
      const [assignmentsRows] = await pool.query(
        `SELECT po.*, 
                p.id as publisher_id,
                p.email as publisher_email,
                p.first_name as publisher_first_name,
                p.company_name as publisher_company,
                p.country as publisher_country,
                p.status as publisher_status
         FROM publisher_offers po
         JOIN publishers p ON po.publisher_id = p.id
         WHERE po.offer_id = ?
         ORDER BY po.assigned_at DESC`,
        [id]
      );
      const assignments = Array.isArray(assignmentsRows) ? assignmentsRows : [];

      // Format assignments
      const formattedAssignments = assignments.map(assignment => ({
        id: assignment.id,
        publisher_id: assignment.publisher_id,
        publisher_email: assignment.publisher_email,
        publisher_first_name: assignment.publisher_first_name,
        publisher_company: assignment.publisher_company,
        publisher_country: assignment.publisher_country,
        publisher_status: assignment.publisher_status,
        payout_override: assignment.payout_override,
        cap_override: assignment.cap_override,
        conversion_approval_percentage: assignment.conversion_approval_percentage,
        capping_budget: assignment.capping_budget_duration ? {
          duration: assignment.capping_budget_duration,
          amount: assignment.capping_budget_amount,
        } : null,
        capping_conversions: assignment.capping_conversions_duration ? {
          duration: assignment.capping_conversions_duration,
          amount: assignment.capping_conversions_amount,
        } : null,
        callback_url: assignment.callback_url,
        destination_url: assignment.destination_url,
        notes: assignment.notes,
        status: assignment.status,
        assigned_at: assignment.assigned_at,
      }));

      // Get statistics
      const [statsRows] = await pool.query(
        `SELECT 
          COUNT(DISTINCT c.id) as total_clicks,
          COUNT(DISTINCT c.publisher_id) as unique_publishers,
          COUNT(DISTINCT i.id) as total_impressions,
          COUNT(DISTINCT conv.id) as total_conversions,
          COUNT(DISTINCT CASE WHEN conv.status = 'approved' THEN conv.id END) as approved_conversions,
          COUNT(DISTINCT CASE WHEN conv.status = 'pending' THEN conv.id END) as pending_conversions,
          COUNT(DISTINCT CASE WHEN conv.status = 'rejected' THEN conv.id END) as rejected_conversions,
          COALESCE(SUM(conv.amount), 0) as total_revenue,
          COALESCE(SUM(conv.payout), 0) as total_payout,
          COALESCE(SUM(conv.amount - conv.payout), 0) as total_profit
        FROM offers o
        LEFT JOIN clicks c ON c.offer_id = o.id
        LEFT JOIN impressions i ON i.offer_id = o.id
        LEFT JOIN conversions conv ON conv.offer_id = o.id
        WHERE o.id = ?`,
        [id]
      );
      const stats = Array.isArray(statsRows) ? statsRows[0] : statsRows;

      // Calculate conversion rate
      const conversionRate = stats.total_clicks > 0
        ? ((stats.total_conversions || 0) / stats.total_clicks) * 100
        : 0;

      // Get recent clicks (last 50)
      const [recentClicksRows] = await pool.query(
        `SELECT c.*, 
                p.email as publisher_email,
                p.company_name as publisher_company
         FROM clicks c
         LEFT JOIN publishers p ON c.publisher_id = p.id
         WHERE c.offer_id = ?
         ORDER BY c.created_at DESC
         LIMIT 50`,
        [id]
      );
      const recentClicks = Array.isArray(recentClicksRows) ? recentClicksRows : [];

      // Get recent conversions (last 50)
      const [recentConversionsRows] = await pool.query(
        `SELECT conv.*,
                p.email as publisher_email,
                p.company_name as publisher_company,
                c.click_uuid
         FROM conversions conv
         LEFT JOIN publishers p ON conv.publisher_id = p.id
         LEFT JOIN clicks c ON conv.click_uuid = c.click_uuid
         WHERE conv.offer_id = ?
         ORDER BY conv.created_at DESC
         LIMIT 50`,
        [id]
      );
      const recentConversions = Array.isArray(recentConversionsRows) ? recentConversionsRows : [];

      // Get clicks by publisher
      const [clicksByPublisherRows] = await pool.query(
        `SELECT 
          c.publisher_id,
          p.email as publisher_email,
          p.company_name as publisher_company,
          COUNT(DISTINCT c.id) as click_count,
          COUNT(DISTINCT conv.id) as conversion_count,
          COALESCE(SUM(conv.amount), 0) as revenue,
          COALESCE(SUM(conv.payout), 0) as payout
        FROM clicks c
        LEFT JOIN publishers p ON c.publisher_id = p.id
        LEFT JOIN conversions conv ON conv.click_uuid = c.click_uuid
        WHERE c.offer_id = ?
        GROUP BY c.publisher_id, p.email, p.company_name
        ORDER BY click_count DESC`,
        [id]
      );
      const clicksByPublisher = Array.isArray(clicksByPublisherRows) ? clicksByPublisherRows : [];

      return {
        ...offer,
        advertiser,
        assignments: formattedAssignments,
        statistics: {
          total_clicks: parseInt(stats.total_clicks || 0),
          unique_publishers: parseInt(stats.unique_publishers || 0),
          total_impressions: parseInt(stats.total_impressions || 0),
          total_conversions: parseInt(stats.total_conversions || 0),
          approved_conversions: parseInt(stats.approved_conversions || 0),
          pending_conversions: parseInt(stats.pending_conversions || 0),
          rejected_conversions: parseInt(stats.rejected_conversions || 0),
          total_revenue: parseFloat(stats.total_revenue || 0),
          total_payout: parseFloat(stats.total_payout || 0),
          total_profit: parseFloat(stats.total_profit || 0),
          conversion_rate: parseFloat(conversionRate.toFixed(2)),
        },
        recent_clicks: recentClicks,
        recent_conversions: recentConversions,
        clicks_by_publisher: clicksByPublisher,
      };
    } catch (error) {
      logger.error('OfferService.findByIdWithDetails error:', error);
      throw error;
    }
  }
  
  async findByUrlKey(urlKey) {
    const [rows] = await pool.query('SELECT * FROM offers WHERE url_key = ?', [urlKey]);
    return Array.isArray(rows) ? rows[0] : rows;
  }
  
  async findAll(filters = {}) {
    let query = 'SELECT * FROM offers WHERE 1=1';
    const params = [];
    
    if (filters.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    
    if (filters.category) {
      query += ' AND category = ?';
      params.push(filters.category);
    }
    
    if (filters.live) {
      query += ` AND status = 'active' AND (start_at IS NULL OR start_at <= CURRENT_TIMESTAMP) AND (end_at IS NULL OR end_at >= CURRENT_TIMESTAMP)`;
    }
    
    query += ' ORDER BY created_at DESC';
    
    const [rows] = await pool.query(query, params);
    return rows;
  }
  
  async getLive() {
    return this.findAll({ live: true });
  }
  
  async getApproved() {
    return this.findAll({ status: 'active' });
  }
  
  async getAll() {
    return this.findAll();
  }
  
  async getCategories() {
    const [rows] = await pool.query(`
      SELECT category, COUNT(*) as count
      FROM offers
      WHERE status != 'remove'
      GROUP BY category
    `);
    return rows;
  }
  
  async updateStatus(id, status) {
    await pool.query(
      'UPDATE offers SET status = ?, updated_at = NOW() WHERE id = ?',
      [status, id]
    );
    return this.findById(id);
  }
  
  async update(id, data) {
    const fields = [];
    const params = [];
    
    Object.keys(data).forEach((key) => {
      if (data[key] !== undefined && key !== 'id') {
        fields.push(`${key} = ?`);
        params.push(data[key]);
      }
    });
    
    if (fields.length === 0) {
      return this.findById(id);
    }
    
    fields.push(`updated_at = NOW()`);
    params.push(id);
    
    const query = `UPDATE offers SET ${fields.join(', ')} WHERE id = ?`;
    await pool.query(query, params);
    return this.findById(id);
  }
  
  async checkCapping(offerId, publisherId, publisherOfferId = null) {
    const today = new Date().toISOString().split('T')[0];
    
    // Get cap limit
    let capLimit = null;
    if (publisherOfferId) {
      const [assignmentRows] = await pool.query(
        'SELECT cap_override FROM publisher_offers WHERE id = ?',
        [publisherOfferId]
      );
      const assignment = Array.isArray(assignmentRows) ? assignmentRows[0] : assignmentRows;
      if (assignment?.cap_override) {
        capLimit = assignment.cap_override;
      }
    }
    
    if (!capLimit) {
      const [offerRows] = await pool.query(
        'SELECT capping_per_day FROM offers WHERE id = ?',
        [offerId]
      );
      const offer = Array.isArray(offerRows) ? offerRows[0] : offerRows;
      capLimit = offer?.capping_per_day || 0;
    }
    
    if (capLimit === 0) {
      return { capped: false, count: 0, limit: 0 };
    }
    
    // Count clicks today
    const [countRows] = await pool.query(
      `SELECT COUNT(*) as count
       FROM clicks
       WHERE offer_id = ?
         AND publisher_id = ?
         AND DATE(created_at) = ?`,
      [offerId, publisherId, today]
    );
    
    const count = parseInt((Array.isArray(countRows) ? countRows[0] : countRows).count || 0);
    
    return {
      capped: count >= capLimit,
      count,
      limit: capLimit,
    };
  }
  
  async getStats() {
    const [rows] = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'live' THEN 1 ELSE 0 END) as active
      FROM offers
      WHERE status != 'remove'
    `);
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async softDelete(id) {
    await pool.query(
      `UPDATE offers SET status = 'remove', updated_at = NOW() WHERE id = ?`,
      [id]
    );
    return this.findById(id);
  }
}

export default new OfferService();

