import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import publisherService from './publisherService.js';
import offerService from './offerService.js';
import { generateTrackingURL } from '../utils/urlGenerator.js';

export class AssignmentService {
  async create(data) {
    try {
      // Verify publisher exists
      const publisher = await publisherService.findById(data.publisher_id);
      if (!publisher) {
        throw new Error('Publisher not found');
      }
      
      // Verify offer exists
      const offer = await offerService.findById(data.offer_id);
      if (!offer) {
        throw new Error('Offer not found');
      }
      
      await pool.query(
        `INSERT INTO publisher_offers (
          publisher_id, offer_id, payout_override, cap_override, notes, status, assigned_at
        ) VALUES (?, ?, ?, ?, ?, ?, NOW())
        ON DUPLICATE KEY UPDATE 
          payout_override = VALUES(payout_override),
          cap_override = VALUES(cap_override),
          notes = VALUES(notes),
          status = VALUES(status)`,
        [
          data.publisher_id,
          data.offer_id,
          data.payout_override || null,
          data.cap_override || null,
          data.notes || null,
          data.status || 'active',
        ]
      );
      
      const [rows] = await pool.query(
        `SELECT po.*, 
                p.email as publisher_email, p.company_name as publisher_company,
                o.name as offer_name, o.category as offer_category
         FROM publisher_offers po
         JOIN publishers p ON po.publisher_id = p.id
         JOIN offers o ON po.offer_id = o.id
         WHERE po.publisher_id = ? AND po.offer_id = ?
         LIMIT 1`,
        [data.publisher_id, data.offer_id]
      );
      
      return Array.isArray(rows) ? rows[0] : rows;
    } catch (error) {
      logger.error('AssignmentService.create error:', error);
      throw error;
    }
  }
  
  async findById(id) {
    const [rows] = await pool.query(
      `SELECT po.*, 
              p.email as publisher_email, p.company_name as publisher_company,
              o.name as offer_name, o.category as offer_category
       FROM publisher_offers po
       JOIN publishers p ON po.publisher_id = p.id
       JOIN offers o ON po.offer_id = o.id
       WHERE po.id = ?`,
      [id]
    );
    return Array.isArray(rows) ? rows[0] : rows;
  }
  
  async findAll(filters = {}) {
    let query = `
      SELECT po.*, 
             p.email as publisher_email, p.company_name as publisher_company,
             o.name as offer_name, o.category as offer_category
      FROM publisher_offers po
      JOIN publishers p ON po.publisher_id = p.id
      JOIN offers o ON po.offer_id = o.id
      WHERE 1=1
    `;
    const params = [];
    
    if (filters.publisher_id) {
      query += ` AND po.publisher_id = ?`;
      params.push(filters.publisher_id);
    }
    
    if (filters.offer_id) {
      query += ` AND po.offer_id = ?`;
      params.push(filters.offer_id);
    }
    
    query += ' ORDER BY po.assigned_at DESC';
    
    const [rows] = await pool.query(query, params);
    return rows;
  }
  
  async generateTrackingURL(assignmentId, baseURL) {
    const assignment = await this.findById(assignmentId);
    if (!assignment) {
      return null;
    }
    
    return generateTrackingURL(
      baseURL,
      assignment.offer_id,
      assignment.publisher_id,
      { tid: '{TID}' }
    );
  }
  
  async getPayout(assignmentId) {
    const assignment = await this.findById(assignmentId);
    if (!assignment) {
      return null;
    }
    
    // If payout_override exists, use it; otherwise use offer's affiliate_model_cost
    if (assignment.payout_override) {
      return parseFloat(assignment.payout_override);
    }
    
    const offer = await offerService.findById(assignment.offer_id);
    return offer ? parseFloat(offer.affiliate_model_cost) : null;
  }

  async delete(id) {
    const [result] = await pool.query(`DELETE FROM publisher_offers WHERE id = ?`, [id]);
    return (result.affectedRows || 0) > 0;
  }
}

export default new AssignmentService();

