import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import bcrypt from 'bcrypt';

export class PublisherService {
  async create(data) {
    try {
      // Hash password if provided
      let passwordHash = null;
      if (data.password) {
        passwordHash = await bcrypt.hash(data.password, 10);
      }

      const [result] = await pool.query(
        `INSERT INTO publishers (
          email, first_name, company_name, country, password_hash, global_postback_url, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'active', UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
        [
          data.email,
          data.first_name || null,
          data.company_name || null,
          data.country || null,
          passwordHash,
          data.global_postback_url || null,
        ]
      );

      const insertId = result.insertId || result[0]?.insertId;
      const [rows] = await pool.query(
        'SELECT id, email, first_name, company_name, country, global_postback_url, status, created_at, updated_at FROM publishers WHERE id = ?',
        [insertId]
      );
      const publisher = Array.isArray(rows) ? rows[0] : rows;
      // Remove password_hash from response
      if (publisher && publisher.password_hash) {
        delete publisher.password_hash;
      }
      return publisher;
    } catch (error) {
      logger.error('PublisherService.create error:', error);
      throw error;
    }
  }

  async findById(id) {
    const [rows] = await pool.query(
      'SELECT id, email, first_name, company_name, country, global_postback_url, status, created_at, updated_at FROM publishers WHERE id = ?',
      [id]
    );
    const publisher = Array.isArray(rows) ? rows[0] : rows;
    // Remove password_hash from response if present
    if (publisher && publisher.password_hash) {
      delete publisher.password_hash;
    }
    return publisher;
  }

  async findByEmail(email) {
    const [rows] = await pool.query(
      'SELECT id, email, first_name, company_name, country, global_postback_url, status, created_at, updated_at FROM publishers WHERE email = ?',
      [email]
    );
    const publisher = Array.isArray(rows) ? rows[0] : rows;
    // Remove password_hash from response if present
    if (publisher && publisher.password_hash) {
      delete publisher.password_hash;
    }
    return publisher;
  }

  // Internal method to get publisher with password_hash (for authentication)
  async findByEmailWithPassword(email) {
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
      SELECT id, email, first_name, company_name, country, global_postback_url, status, created_at, updated_at
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

    // Handle password hashing separately
    if (data.password !== undefined) {
      const passwordHash = await bcrypt.hash(data.password, 10);
      fields.push(`password_hash = ?`);
      params.push(passwordHash);
    }

    // Handle other allowed fields
    const allowedFields = ['email', 'first_name', 'company_name', 'country', 'global_postback_url', 'status'];
    Object.keys(data).forEach((key) => {
      if (data[key] !== undefined && allowedFields.includes(key) && key !== 'password') {
        fields.push(`${key} = ?`);
        params.push(data[key]);
      }
    });

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = UTC_TIMESTAMP()`);
    params.push(id);

    const query = `UPDATE publishers SET ${fields.join(', ')} WHERE id = ?`;
    await pool.query(query, params);
    // Return publisher without password_hash
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
      `UPDATE publishers SET status = 'suspended', updated_at = UTC_TIMESTAMP() WHERE id = ?`,
      [id]
    );
    if ((result.affectedRows || result.affectedRows === 0) && result.affectedRows === 0) {
      return null;
    }
    return this.findById(id);
  }
}

export default new PublisherService();

