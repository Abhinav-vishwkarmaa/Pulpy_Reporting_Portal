import pool from '../db/connection.js';
import logger from '../utils/logger.js';

export class PublisherService {
  async create(data) {
    try {
      const [result] = await pool.query(
        `INSERT INTO publishers (
          email, mobile, first_name, last_name, company_name, position,
          address, state, country, zip_code, tax_invoice_details,
          payment_terms, global_postback_url, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          data.email,
          data.mobile || null,
          data.first_name || null,
          data.last_name || null,
          data.company_name || null,
          data.position || null,
          data.address || null,
          data.state || null,
          data.country || null,
          data.zip_code || null,
          data.tax_invoice_details ? JSON.stringify(data.tax_invoice_details) : null,
          data.payment_terms ? JSON.stringify(data.payment_terms) : null,
          data.global_postback_url || null,
          data.status || 'pending',
        ]
      );
      
      const insertId = result.insertId || result[0]?.insertId;
      const [rows] = await pool.query('SELECT * FROM publishers WHERE id = ?', [insertId]);
      return Array.isArray(rows) ? rows[0] : rows;
    } catch (error) {
      logger.error('PublisherService.create error:', error);
      throw error;
    }
  }
  
  async findById(id) {
    const [rows] = await pool.query('SELECT * FROM publishers WHERE id = ?', [id]);
    return Array.isArray(rows) ? rows[0] : rows;
  }
  
  async findByEmail(email) {
    const [rows] = await pool.query('SELECT * FROM publishers WHERE email = ?', [email]);
    return Array.isArray(rows) ? rows[0] : rows;
  }
  
  async findAll(filters = {}) {
    let where = ' WHERE 1=1';
    const params = [];

    if (filters.status) {
      where += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters.email) {
      where += ' AND email LIKE ?';
      params.push(`%${filters.email}%`);
    }

    if (filters.company_name) {
      where += ' AND company_name LIKE ?';
      params.push(`%${filters.company_name}%`);
    }

    // Pagination
    const page = parseInt(filters.page || 1, 10);
    const limit = parseInt(filters.limit || 10, 10);
    const offset = (page - 1) * limit;

    const dataQuery = `
      SELECT *
      FROM publishers
      ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    const countQuery = `
      SELECT COUNT(*) as count
      FROM publishers
      ${where}
    `;

    const [dataRows] = await pool.query(dataQuery, [...params, limit, offset]);
    const [countRows] = await pool.query(countQuery, params);
    const total = countRows[0]?.count || 0;

    return {
      data: dataRows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
  
  async update(id, data) {
    const fields = [];
    const params = [];
    
    Object.keys(data).forEach((key) => {
      if (data[key] !== undefined) {
        if (key === 'tax_invoice_details' || key === 'payment_terms') {
          fields.push(`${key} = ?`);
          params.push(data[key] ? JSON.stringify(data[key]) : null);
        } else {
          fields.push(`${key} = ?`);
          params.push(data[key]);
        }
      }
    });
    
    if (fields.length === 0) {
      return this.findById(id);
    }
    
    fields.push(`updated_at = NOW()`);
    params.push(id);
    
    const query = `UPDATE publishers SET ${fields.join(', ')} WHERE id = ?`;
    await pool.query(query, params);
    return this.findById(id);
  }
  
  async getStats() {
    const [rows] = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) as suspended
      FROM publishers
    `);
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async softDelete(id) {
    const [result] = await pool.query(
      `UPDATE publishers SET status = 'suspended', updated_at = NOW() WHERE id = ?`,
      [id]
    );
    if ((result.affectedRows || result.affectedRows === 0) && result.affectedRows === 0) {
      return null;
    }
    return this.findById(id);
  }
}

export default new PublisherService();

