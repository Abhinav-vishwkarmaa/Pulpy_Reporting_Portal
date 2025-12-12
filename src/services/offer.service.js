import pool from '../db/connection.js';
import logger from '../utils/logger.js';

const jsonFields = [
  'macros_json',
  'device_targeting_json',
  'os_targeting_json',
  'browser_targeting_json',
  'isp_targeting_json',
  'carrier_targeting_json',
  'city_targeting_json',
  'advertiser_postback_macros_json',
  'system_postback_macros_json',
];

const toJsonOrNull = (val) =>
  val === undefined || val === null ? null : JSON.stringify(val);

class OfferService {
  async createOffer(data) {
    try {
      // Validate advertiser exists
      if (data.advertiser_id) {
        const [advRows] = await pool.query('SELECT id FROM advertisers WHERE id = ?', [data.advertiser_id]);
        if (!advRows || advRows.length === 0) {
          const err = new Error('Advertiser not found');
          err.statusCode = 400;
          throw err;
        }
      }

      const sql = `
        INSERT INTO offers (
          advertiser_id,
          name, description, category, status,
          offer_currency, country,
          advertiser_model, advertiser_amount,
          affiliate_model, affiliate_amount,
          offer_url, preview_url, token_type, macros_json,
          start_date, end_date, start_time, end_time,
          ip_action, ip_list,
          device_targeting_json, os_targeting_json, browser_targeting_json,
          isp_targeting_json, carrier_targeting_json, city_targeting_json,
          capping_type, daily_cap, monthly_cap, total_cap, conversion_cap, budget_cap, cap_action,
          fallback_enabled, fallback_url, fallback_offer_id,
          advertiser_postback_url, advertiser_postback_method, advertiser_postback_macros_json,
          system_postback_url, system_postback_method, system_postback_macros_json
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?
        )
      `;

      const params = [
        data.advertiser_id,
        data.name,
        data.description || null,
        data.category || null,
        data.status || 'draft',
        data.offer_currency,
        data.country,
        data.advertiser_model,
        data.advertiser_amount,
        data.affiliate_model,
        data.affiliate_amount,
        data.offer_url,
        data.preview_url || null,
        data.token_type || null,
        toJsonOrNull(data.macros_json),
        data.start_date || null,
        data.end_date || null,
        data.start_time || null,
        data.end_time || null,
        data.ip_action || null,
        data.ip_list || null,
        toJsonOrNull(data.device_targeting_json),
        toJsonOrNull(data.os_targeting_json),
        toJsonOrNull(data.browser_targeting_json),
        toJsonOrNull(data.isp_targeting_json),
        toJsonOrNull(data.carrier_targeting_json),
        toJsonOrNull(data.city_targeting_json),
        data.capping_type || 'none',
        data.daily_cap ?? null,
        data.monthly_cap ?? null,
        data.total_cap ?? null,
        data.conversion_cap ?? null,
        data.budget_cap ?? null,
        data.cap_action || null,
        data.fallback_enabled ? 1 : 0,
        data.fallback_url || null,
        data.fallback_offer_id ?? null,
        data.advertiser_postback_url || null,
        data.advertiser_postback_method || null,
        toJsonOrNull(data.advertiser_postback_macros_json),
        data.system_postback_url || null,
        data.system_postback_method || null,
        toJsonOrNull(data.system_postback_macros_json),
      ];

      const [result] = await pool.query(sql, params);
      const insertId = result.insertId ?? result?.[0]?.insertId;
      return this.getOfferById(insertId);
    } catch (error) {
      logger.error('OfferService.createOffer error:', error);
      throw error;
    }
  }

  async updateOffer(id, data) {
    try {
      if (data.advertiser_id !== undefined && data.advertiser_id !== null) {
        const [advRows] = await pool.query('SELECT id FROM advertisers WHERE id = ?', [data.advertiser_id]);
        if (!advRows || advRows.length === 0) {
          const err = new Error('Advertiser not found');
          err.statusCode = 400;
          throw err;
        }
      }

      const fields = [];
      const params = [];

      const updatable = [
        'advertiser_id',
        'name',
        'description',
        'category',
        'status',
        'offer_currency',
        'country',
        'advertiser_model',
        'advertiser_amount',
        'affiliate_model',
        'affiliate_amount',
        'offer_url',
        'preview_url',
        'token_type',
        'macros_json',
        'start_date',
        'end_date',
        'start_time',
        'end_time',
        'ip_action',
        'ip_list',
        'device_targeting_json',
        'os_targeting_json',
        'browser_targeting_json',
        'isp_targeting_json',
        'carrier_targeting_json',
        'city_targeting_json',
        'capping_type',
        'daily_cap',
        'monthly_cap',
        'total_cap',
        'conversion_cap',
        'budget_cap',
        'cap_action',
        'fallback_enabled',
        'fallback_url',
        'fallback_offer_id',
        'advertiser_postback_url',
        'advertiser_postback_method',
        'advertiser_postback_macros_json',
        'system_postback_url',
        'system_postback_method',
        'system_postback_macros_json',
      ];

      updatable.forEach((key) => {
        if (data[key] !== undefined) {
          let value = data[key];
          if (jsonFields.includes(key)) {
            value = toJsonOrNull(value);
          } else if (key === 'fallback_enabled') {
            value = value ? 1 : 0;
          }
          fields.push(`${key} = ?`);
          params.push(value ?? null);
        }
      });

      if (!fields.length) {
        return this.getOfferById(id);
      }

      fields.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);

      const sql = `UPDATE offers SET ${fields.join(', ')} WHERE id = ?`;
      const [result] = await pool.query(sql, params);
      if (!result.affectedRows) {
        return null;
      }

      return this.getOfferById(id);
    } catch (error) {
      logger.error('OfferService.updateOffer error:', error);
      throw error;
    }
  }

  async getOfferById(id) {
    const [rows] = await pool.query('SELECT * FROM offers WHERE id = ? LIMIT 1', [id]);
    return Array.isArray(rows) ? rows[0] : rows;
  }

  async listOffers(filters = {}) {
    const conditions = [];
    const params = [];

    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }

    if (filters.advertiser_id) {
      conditions.push('advertiser_id = ?');
      params.push(filters.advertiser_id);
    }

    if (filters.category) {
      conditions.push('category = ?');
      params.push(filters.category);
    }

    if (filters.search) {
      const term = `%${filters.search}%`;
      conditions.push('(name LIKE ? OR description LIKE ?)');
      params.push(term, term);
    }

    const page = Number(filters.page) > 0 ? Number(filters.page) : 1;
    const limit = Number(filters.limit) > 0 ? Number(filters.limit) : 20;
    const offset = (page - 1) * limit;

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const listSql = `
      SELECT *
      FROM offers
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `;

    const [rows] = await pool.query(listSql, [...params, limit, offset]);

    const countSql = `
      SELECT COUNT(*) AS total
      FROM offers
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

  async deleteOffer(id) {
    try {
      const [result] = await pool.query('DELETE FROM offers WHERE id = ?', [id]);
      if (!result.affectedRows) {
        return null;
      }
      return { id, deleted: true };
    } catch (error) {
      logger.error('OfferService.deleteOffer error:', error);
      throw error;
    }
  }

  async changeStatus(id, status) {
    try {
      const [result] = await pool.query(
        'UPDATE offers SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [status, id]
      );
      if (!result.affectedRows) {
        return null;
      }
      return this.getOfferById(id);
    } catch (error) {
      logger.error('OfferService.changeStatus error:', error);
      throw error;
    }
  }
}

export default new OfferService();
