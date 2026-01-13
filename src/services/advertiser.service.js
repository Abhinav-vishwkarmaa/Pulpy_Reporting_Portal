import pool from '../db/connection.js';
import logger from '../utils/logger.js';

class AdvertiserService {
  async createAdvertiser(data) {
    try {
      const sql = `
        INSERT INTO advertisers (
          name,
          email,
          company_name,
          country,
          website,
          notes,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `;

      const params = [
        data.name,
        data.email,
        data.company_name || null,
        data.country,
        data.website || null,
        data.notes || null,
        data.status || 'active',
      ];

      const [result] = await pool.query(sql, params);
      const insertId = result.insertId ?? result?.[0]?.insertId;
      return this.getAdvertiserById(insertId);
    } catch (error) {
      logger.error('AdvertiserService.createAdvertiser error:', error);
      throw error;
    }
  }

  async updateAdvertiser(id, data) {
    try {
      const fields = [];
      const params = [];

      const updatable = [
        'name',
        'email',
        'company_name',
        'country',
        'website',
        'notes',
        'status',
      ];

      updatable.forEach((key) => {
        if (data[key] !== undefined) {
          fields.push(`${key} = ?`);
          params.push(data[key] ?? null);
        }
      });

      if (!fields.length) {
        return this.getAdvertiserById(id);
      }

      fields.push('updated_at = UTC_TIMESTAMP()');
      params.push(id);

      const sql = `UPDATE advertisers SET ${fields.join(', ')} WHERE id = ?`;
      const [result] = await pool.query(sql, params);
      if (!result.affectedRows) {
        return null;
      }

      return this.getAdvertiserById(id);
    } catch (error) {
      logger.error('AdvertiserService.updateAdvertiser error:', error);
      throw error;
    }
  }

  async getAdvertiserById(id) {
    const [rows] = await pool.query(
      'SELECT * FROM advertisers WHERE id = ? LIMIT 1',
      [id]
    );
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async listAdvertisers(filters = {}) {
    const conditions = [];
    const params = [];

    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }

    if (filters.country) {
      conditions.push('country = ?');
      params.push(filters.country);
    }

    if (filters.search) {
      const term = `%${filters.search}%`;
      conditions.push('(name LIKE ? OR email LIKE ? OR company_name LIKE ?)');
      params.push(term, term, term);
    }

    const page = Number(filters.page) > 0 ? Number(filters.page) : 1;
    const limit = Number(filters.limit) > 0 ? Number(filters.limit) : 20;
    const offset = (page - 1) * limit;

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const listSql = `
      SELECT *
      FROM advertisers
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.query(listSql, [...params, limit, offset]);

    const countSql = `
      SELECT COUNT(*) AS total
      FROM advertisers
      ${whereClause}
    `;
    const [countRows] = await pool.query(countSql, params);
    const total = Array.isArray(countRows) ? countRows[0]?.total || 0 : 0;

    return {
      data: rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: total ? Math.ceil(total / limit) : 0,
      },
    };
  }

  async deleteAdvertiser(id) {
    try {
      const sql = `
        UPDATE advertisers
        SET status = 'inactive', updated_at = UTC_TIMESTAMP()
        WHERE id = ?
      `;
      const [result] = await pool.query(sql, [id]);

      if (!result.affectedRows) {
        return null;
      }

      return this.getAdvertiserById(id);
    } catch (error) {
      logger.error('AdvertiserService.deleteAdvertiser error:', error);
      throw error;
    }
  }
}

export default new AdvertiserService();
