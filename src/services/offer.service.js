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
  /**
   * Check if offer is valid for operations (clicks, conversions, etc.)
   * @param {Object} offer - Offer object from database
   * @returns {Object} - { valid: boolean, message: string, error_type: string }
   */
  checkOfferValidity(offer) {
    if (!offer) {
      return {
        valid: false,
        message: 'Offer not found',
        error_type: 'offer_not_found'
      };
    }

    // Check offer status
    if (offer.status !== 'live') {
      return {
        valid: false,
        message: `Offer is not live. Current status: ${offer.status}. Only live offers can accept traffic.`,
        error_type: 'offer_not_live'
      };
    }

    const now = new Date();

    // Check if offer has expired (end_date passed)
    if (offer.end_date) {
      const endDate = new Date(offer.end_date);
      endDate.setHours(23, 59, 59, 999); // End of day
      
      if (now > endDate) {
        return {
          valid: false,
          message: `Offer has expired. End date: ${offer.end_date}. The offer is no longer accepting traffic.`,
          error_type: 'offer_expired'
        };
      }
    }

    // Check if offer hasn't started yet (start_date in future)
    if (offer.start_date) {
      const startDate = new Date(offer.start_date);
      startDate.setHours(0, 0, 0, 0); // Start of day
      
      if (now < startDate) {
        return {
          valid: false,
          message: `Offer has not started yet. Start date: ${offer.start_date}. The offer will become active on this date.`,
          error_type: 'offer_not_started'
        };
      }
    }

    return {
      valid: true,
      message: 'Offer is valid and active',
      error_type: null
    };
  }

  /**
   * Validate offer dates and status for create/update operations
   * @param {Object} offerData - Offer data to validate
   * @param {Object} existingOffer - Existing offer (for updates)
   * @returns {Object} - { valid: boolean, message: string, error_type: string }
   */
  validateOfferDatesAndStatus(offerData, existingOffer = null) {
    const now = new Date();

    // Check if offer has expired (end_date passed)
    const endDate = offerData.end_date || (existingOffer ? existingOffer.end_date : null);
    if (endDate) {
      const endDateObj = new Date(endDate);
      endDateObj.setHours(23, 59, 59, 999); // End of day
      
      if (now > endDateObj) {
        return {
          valid: false,
          message: `Offer has expired. End date (${endDate}) has already passed. Cannot create or update expired offers.`,
          error_type: 'offer_expired'
        };
      }
    }

    // Check if status is being set to 'live' but offer has expired
    const status = offerData.status || (existingOffer ? existingOffer.status : null);
    if (status === 'live' && endDate) {
      const endDateObj = new Date(endDate);
      endDateObj.setHours(23, 59, 59, 999);
      
      if (now > endDateObj) {
        return {
          valid: false,
          message: `Cannot set offer status to 'live': Offer has expired. End date (${endDate}) has already passed.`,
          error_type: 'offer_expired'
        };
      }
    }

    // Check if trying to set status to 'live' but offer is not live
    if (status && status !== 'live' && existingOffer && existingOffer.status !== 'live') {
      // This is just informational, not blocking
    }

    return {
      valid: true,
      message: 'Offer validation passed',
      error_type: null
    };
  }

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

      // Validate offer dates and status
      const validation = this.validateOfferDatesAndStatus(data);
      if (!validation.valid) {
        const err = new Error(validation.message);
        err.statusCode = 400;
        throw err;
      }

      const sql = `
        INSERT INTO offers (
          advertiser_id,
          name, description, category, status, offer_visibility,
          offer_currency, country,
          advertiser_model, advertiser_amount,
          affiliate_model, affiliate_amount,
          offer_url, preview_url, token_type, macros_json,
          start_date, end_date, start_time, end_time,
          ip_action, ip_list,
          device_targeting_json, device_action,
          os_targeting_json, os_action,
          browser_targeting_json, browser_action,
          isp_targeting_json, carrier_targeting_json, city_targeting_json,
          capping_type, daily_cap, monthly_cap, total_cap, conversion_cap, capping_conversions_duration,
          budget_cap, advertiser_capping_budget_duration, advertiser_capping_budget_amount,
          advertiser_over_capping, affiliate_over_capping, cap_action,
          fallback_enabled, fallback_url, fallback_offer_id,
          advertiser_postback_url, advertiser_postback_method, advertiser_postback_macros_json,
          system_postback_url, system_postback_method, system_postback_macros_json
        ) VALUES (
          ?, ?, ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          ?, ?,
          ?, ?,
          ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?,
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
        data.offer_visibility || null,
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
        data.device_action || null,
        toJsonOrNull(data.os_targeting_json),
        data.os_action || null,
        toJsonOrNull(data.browser_targeting_json),
        data.browser_action || null,
        toJsonOrNull(data.isp_targeting_json),
        toJsonOrNull(data.carrier_targeting_json),
        toJsonOrNull(data.city_targeting_json),
        data.capping_type || 'none',
        data.daily_cap ?? null,
        data.monthly_cap ?? null,
        data.total_cap ?? null,
        data.conversion_cap ?? null,
        data.capping_conversions_duration || null,
        data.budget_cap ?? null,
        data.advertiser_capping_budget_duration || null,
        data.advertiser_capping_budget_amount ?? null,
        data.advertiser_over_capping || null,
        data.affiliate_over_capping || null,
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

      // Get existing offer for validation
      const existingOffer = await this.getOfferById(id);
      if (!existingOffer) {
        const err = new Error('Offer not found');
        err.statusCode = 404;
        throw err;
      }

      // Validate offer dates and status
      const validation = this.validateOfferDatesAndStatus(data, existingOffer);
      if (!validation.valid) {
        const err = new Error(validation.message);
        err.statusCode = 400;
        throw err;
      }

      const fields = [];
      const params = [];

      const updatable = [
        'advertiser_id',
        'name',
        'description',
        'category',
        'status',
        'offer_visibility',
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
        'device_action',
        'os_targeting_json',
        'os_action',
        'browser_targeting_json',
        'browser_action',
        'isp_targeting_json',
        'carrier_targeting_json',
        'city_targeting_json',
        'capping_type',
        'daily_cap',
        'monthly_cap',
        'total_cap',
        'conversion_cap',
        'capping_conversions_duration',
        'budget_cap',
        'advertiser_capping_budget_duration',
        'advertiser_capping_budget_amount',
        'advertiser_over_capping',
        'affiliate_over_capping',
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

  async getOfferByIdWithDetails(id) {
    try {
      // Get offer details
      const offer = await this.getOfferById(id);
      if (!offer) {
        return null;
      }

      // Parse JSON fields
      const parseJsonFields = (offer) => {
        jsonFields.forEach((field) => {
          if (offer[field]) {
            try {
              offer[field] = typeof offer[field] === 'string' ? JSON.parse(offer[field]) : offer[field];
            } catch (e) {
              offer[field] = null;
            }
          } else {
            offer[field] = null;
          }
        });
        return offer;
      };
      const parsedOffer = parseJsonFields({ ...offer });

      // Get advertiser details if advertiser_id exists
      let advertiser = null;
      if (parsedOffer.advertiser_id) {
        const [advertiserRows] = await pool.query(
          'SELECT * FROM advertisers WHERE id = ?',
          [parsedOffer.advertiser_id]
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
        ...parsedOffer,
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
      logger.error('OfferService.getOfferByIdWithDetails error:', error);
      throw error;
    }
  }

  async listOffers(filters = {}) {
    const conditions = [];
    const params = [];
    console.log('FILTERS RECEIVED:', filters);

    if (filters.type) {
      conditions.push('status = ?');
      params.push(filters.type);
    }

    if (filters.advertiser_id) {
      conditions.push('advertiser_id = ?');
      params.push(filters.advertiser_id);
    }

    if (filters.category) {
      conditions.push('category = ?');
      params.push(filters.category);
    }

    if (filters.offer_visibility) {
      conditions.push('offer_visibility = ?');
      params.push(filters.offer_visibility);
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
      // Get existing offer for validation
      const existingOffer = await this.getOfferById(id);
      if (!existingOffer) {
        const err = new Error('Offer not found');
        err.statusCode = 404;
        throw err;
      }

      // Validate if trying to set status to 'live' but offer has expired
      if (status === 'live') {
        const validation = this.validateOfferDatesAndStatus({ status: 'live' }, existingOffer);
        if (!validation.valid) {
          const err = new Error(validation.message);
          err.statusCode = 400;
          throw err;
        }
      }

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

  async updateAssignment(assignmentId, data) {
    try {
      // First check if assignment exists
      const [existingRows] = await pool.query(
        'SELECT id FROM publisher_offers WHERE id = ?',
        [assignmentId]
      );
      if (!existingRows || existingRows.length === 0) {
        return null;
      }

      const fields = [];
      const params = [];

      const updatable = [
        'payout_override',
        'cap_override',
        'conversion_approval_percentage',
        'capping_budget_duration',
        'capping_budget_amount',
        'capping_conversions_duration',
        'capping_conversions_amount',
        'callback_url',
        'offer_url',
        'status',
        'notes',
      ];

      updatable.forEach((key) => {
        if (data[key] !== undefined) {
          fields.push(`${key} = ?`);
          params.push(data[key] ?? null);
        }
      });

      if (!fields.length) {
        return this.getAssignmentById(assignmentId);
      }

      params.push(assignmentId);

      const sql = `UPDATE publisher_offers SET ${fields.join(', ')} WHERE id = ?`;
      const [result] = await pool.query(sql, params);
      if (!result.affectedRows) {
        return null;
      }

      return this.getAssignmentById(assignmentId);
    } catch (error) {
      logger.error('OfferService.updateAssignment error:', error);
      throw error;
    }
  }

  async getAssignmentById(assignmentId) {
    const [rows] = await pool.query(
      `SELECT po.*,
              p.id as publisher_id,
              p.email as publisher_email,
              p.first_name as publisher_first_name,
              p.company_name as publisher_company,
              p.country as publisher_country,
              p.status as publisher_status,
              o.id as offer_id,
              o.name as offer_name,
              o.status as offer_status
       FROM publisher_offers po
       JOIN publishers p ON po.publisher_id = p.id
       JOIN offers o ON po.offer_id = o.id
       WHERE po.id = ?
       LIMIT 1`,
      [assignmentId]
    );

    if (!rows || rows.length === 0) {
      return null;
    }

    const assignment = rows[0];
    return {
      id: assignment.id,
      publisher_id: assignment.publisher_id,
      publisher_email: assignment.publisher_email,
      publisher_first_name: assignment.publisher_first_name,
      publisher_company: assignment.publisher_company,
      publisher_country: assignment.publisher_country,
      publisher_status: assignment.publisher_status,
      offer_id: assignment.offer_id,
      offer_name: assignment.offer_name,
      offer_status: assignment.offer_status,
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
      offer_url: assignment.offer_url,
      status: assignment.status,
      notes: assignment.notes,
      assigned_at: assignment.assigned_at,
    };
  }
  async geteditOffer(id){
    const [rows] = await pool.query(
      `SELECT *
       FROM offers
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    if (!rows || rows.length === 0) {
      return null;
    }
    return rows[0];
  }
}

export default new OfferService();
