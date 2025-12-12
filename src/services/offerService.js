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
          start_at, end_at, offer_url, capping_per_day, fallback_url,
          status, url_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          data.name,
          data.category,
          data.advertiser_revenue,
          data.affiliate_model_cost,
          startAt,
          endAt,
          data.offer_url,
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
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active
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

