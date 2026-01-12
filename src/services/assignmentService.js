import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import publisherService from './publisherService.js';
import offerService from './offerService.js';
import { generateTrackingURL, generateAlternativeTrackingURL, generateClickId } from '../utils/urlGenerator.js';

export class AssignmentService {
  async create(data) {
    try {
      // Support both new multi-publisher format and legacy single-publisher format
      const isMultiPublisher = Array.isArray(data.publishers);

      if (isMultiPublisher) {
        return await this.createMultiple(data);
      } else {
        return await this.createSingle(data);
      }
    } catch (error) {
      logger.error('AssignmentService.create error:', error);
      throw error;
    }
  }

  async createMultiple(data) {
    const { offer_id, publishers } = data;
    const baseURL = process.env.BASE_URL || process.env.TRACKING_BASE_URL || 'http://localhost:3000';
    const createdAssignments = [];
    const errors = [];

    // Verify offer exists once
    const offer = await offerService.findById(offer_id);
    if (!offer) {
      throw new Error(`Offer with id ${offer_id} not found`);
    }

    // Process each publisher assignment
    for (let i = 0; i < publishers.length; i++) {
      const pubData = publishers[i];

      try {
        // Verify publisher exists
        const publisher = await publisherService.findById(pubData.publisher_id);
        if (!publisher) {
          errors.push({
            index: i,
            publisher_id: pubData.publisher_id,
            error: `Publisher with id ${pubData.publisher_id} not found`,
          });
          continue;
        }

        // Store destination_url only if explicitly provided (override)
        // Do NOT generate tracking URLs - they are dynamic and generated at runtime
        const destinationUrl = pubData.destination_url || pubData.offer_url || null; // Support legacy field name
        const callbackUrl = pubData.callback_url || null; // Store only if explicitly provided (override)

        // Prepare capping data
        const cappingBudgetDuration = pubData.capping_budget?.duration || null;
        const cappingBudgetAmount = pubData.capping_budget?.amount || null;
        const cappingConversionsDuration = pubData.capping_conversions?.duration || null;
        const cappingConversionsAmount = pubData.capping_conversions?.amount || null;

        // Insert or update assignment
        await pool.query(
          `INSERT INTO publisher_offers (
            publisher_id, offer_id, payout_override, 
            conversion_approval_percentage,
            capping_budget_duration, capping_budget_amount,
            capping_conversions_duration, capping_conversions_amount,
            callback_url, destination_url,
            notes, status, assigned_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
          ON DUPLICATE KEY UPDATE 
            payout_override = VALUES(payout_override),
            conversion_approval_percentage = VALUES(conversion_approval_percentage),
            capping_budget_duration = VALUES(capping_budget_duration),
            capping_budget_amount = VALUES(capping_budget_amount),
            capping_conversions_duration = VALUES(capping_conversions_duration),
            capping_conversions_amount = VALUES(capping_conversions_amount),
            callback_url = VALUES(callback_url),
            destination_url = VALUES(destination_url),
            notes = VALUES(notes),
            status = VALUES(status)`,
          [
            pubData.publisher_id,
            offer_id,
            pubData.payout_override || null,
            pubData.conversion_approval_percentage || null,
            cappingBudgetDuration,
            cappingBudgetAmount,
            cappingConversionsDuration,
            cappingConversionsAmount,
            callbackUrl,
            destinationUrl,
            pubData.notes || null,
            pubData.status || 'active',
          ]
        );

        // Fetch the created/updated assignment
        const [rows] = await pool.query(
          `SELECT po.*, 
                  p.email as publisher_email, p.company_name as publisher_company,
                  o.name as offer_name, o.category as offer_category
           FROM publisher_offers po
           JOIN publishers p ON po.publisher_id = p.id
           JOIN offers o ON po.offer_id = o.id
           WHERE po.publisher_id = ? AND po.offer_id = ?
           LIMIT 1`,
          [pubData.publisher_id, offer_id]
        );

        const assignment = Array.isArray(rows) ? rows[0] : rows;
        if (assignment) {
          createdAssignments.push(this.formatAssignment(assignment));
        }
      } catch (error) {
        let errorMessage = error.message || 'Failed to create assignment';

        // Check if it's a database schema error (missing columns)
        if (error.code === 'ER_BAD_FIELD_ERROR' || error.message?.includes('Unknown column')) {
          errorMessage = 'Database schema is outdated. Please run migration: src/db/migrations/004_add_assignment_fields.sql';
          logger.error('AssignmentService.createMultiple: Database schema error - migration required');
        }

        errors.push({
          index: i,
          publisher_id: pubData.publisher_id,
          error: errorMessage,
        });
        logger.error(`AssignmentService.createMultiple error for publisher ${pubData.publisher_id}:`, error);
      }
    }

    // If all failed, throw error
    if (createdAssignments.length === 0 && errors.length > 0) {
      throw new Error(`Failed to create assignments: ${errors.map(e => e.error).join('; ')}`);
    }

    return {
      assignments: createdAssignments,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async createSingle(data) {
    // Legacy single-publisher format support
    const publisher = await publisherService.findById(data.publisher_id);
    if (!publisher) {
      throw new Error('Publisher not found');
    }

    const offer = await offerService.findById(data.offer_id);
    if (!offer) {
      throw new Error('Offer not found');
    }

    // Store destination_url only if explicitly provided (override)
    // Do NOT generate tracking URLs - they are dynamic and generated at runtime
    const destinationUrl = data.destination_url || data.offer_url || null; // Support legacy field name
    const callbackUrl = data.callback_url || null; // Store only if explicitly provided (override)
    //https://url.promotrking.com/landing/subscribe?partner=Pulp&service=MadFunny-or&clickId=<CLICK_ID>
    await pool.query(
      `INSERT INTO publisher_offers (
        publisher_id, offer_id, payout_override, cap_override, 
        callback_url, destination_url,
        notes, status, assigned_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
      ON DUPLICATE KEY UPDATE 
        payout_override = VALUES(payout_override),
        cap_override = VALUES(cap_override),
        callback_url = VALUES(callback_url),
        destination_url = VALUES(destination_url),
        notes = VALUES(notes),
        status = VALUES(status)`,
      [
        data.publisher_id,
        data.offer_id,
        data.payout_override || null,
        data.cap_override || null,
        callbackUrl,
        destinationUrl,
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

    const assignment = Array.isArray(rows) ? rows[0] : rows;
    return this.formatAssignment(assignment);
  }

  formatAssignment(assignment) {
    if (!assignment) return null;

    return {
      id: assignment.id,
      publisher_id: assignment.publisher_id,
      offer_id: assignment.offer_id,
      payout_override: assignment.payout_override,
      cap_override: assignment.cap_override, // Legacy field
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
      // Related data
      publisher_email: assignment.publisher_email,
      publisher_company: assignment.publisher_company,
      offer_name: assignment.offer_name,
      offer_category: assignment.offer_category,
    };
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
    const assignment = Array.isArray(rows) ? rows[0] : rows;
    return this.formatAssignment(assignment);
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

    if (filters.status) {
      query += ` AND po.status = ?`;
      params.push(filters.status);
    }

    query += ' ORDER BY po.assigned_at DESC';

    const [rows] = await pool.query(query, params);
    return rows.map(row => this.formatAssignment(row));
  }

  async generateTrackingURL(assignmentId, baseURL, format = 'standard') {
    const assignment = await this.findById(assignmentId);
    if (!assignment) {
      return null;
    }

    if (format === 'alternative') {
      // Get advertiser ID from offer
      const offer = await offerService.findById(assignment.offer_id);
      const advertiserId = offer ? offer.advertiser_id : null;

      return generateAlternativeTrackingURL(
        baseURL,
        assignment.offer_id,
        assignment.publisher_id,
        advertiserId,
        { rcid: '{replace_it}' } // Use the format they specified
      );
    }

    // Default to standard format
    // Do NOT generate click_id upfront, but pass the placeholder.
    // This allows the UI to show {click_id} in the generated URL.

    return generateTrackingURL(
      baseURL,
      assignment.offer_id,
      assignment.publisher_id,
      { click_id: '{click_id}' }
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

  async update(id, data) {
    try {
      // First check if assignment exists
      const existing = await this.findById(id);
      if (!existing) {
        return null;
      }

      // Prepare update fields
      const cappingBudgetDuration = data.capping_budget?.duration || null;
      const cappingBudgetAmount = data.capping_budget?.amount || null;
      const cappingConversionsDuration = data.capping_conversions?.duration || null;
      const cappingConversionsAmount = data.capping_conversions?.amount || null;

      // Build update query dynamically based on provided fields
      const updateFields = [];
      const updateValues = [];

      if (data.payout_override !== undefined) {
        updateFields.push('payout_override = ?');
        updateValues.push(data.payout_override);
      }
      if (data.conversion_approval_percentage !== undefined) {
        updateFields.push('conversion_approval_percentage = ?');
        updateValues.push(data.conversion_approval_percentage);
      }
      if (data.capping_budget !== undefined) {
        updateFields.push('capping_budget_duration = ?', 'capping_budget_amount = ?');
        updateValues.push(cappingBudgetDuration, cappingBudgetAmount);
      }
      if (data.capping_conversions !== undefined) {
        updateFields.push('capping_conversions_duration = ?', 'capping_conversions_amount = ?');
        updateValues.push(cappingConversionsDuration, cappingConversionsAmount);
      }
      if (data.callback_url !== undefined) {
        updateFields.push('callback_url = ?');
        updateValues.push(data.callback_url || null);
      }
      if (data.destination_url !== undefined || data.offer_url !== undefined) {
        // Support both new field name and legacy field name
        const destinationUrl = data.destination_url !== undefined ? data.destination_url : data.offer_url;
        updateFields.push('destination_url = ?');
        updateValues.push(destinationUrl || null);
      }
      if (data.notes !== undefined) {
        updateFields.push('notes = ?');
        updateValues.push(data.notes || null);
      }
      if (data.status !== undefined) {
        updateFields.push('status = ?');
        updateValues.push(data.status);
      }

      if (updateFields.length === 0) {
        // No fields to update, return existing assignment
        return existing;
      }

      // Add id to updateValues for WHERE clause
      updateValues.push(id);

      // Execute update
      await pool.query(
        `UPDATE publisher_offers SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );

      // Return updated assignment
      return await this.findById(id);
    } catch (error) {
      logger.error('AssignmentService.update error:', error);
      throw error;
    }
  }

  async delete(id) {
    // Soft delete: set status to 'inactive' instead of deleting from database
    const [result] = await pool.query(
      `UPDATE publisher_offers SET status = 'inactive' WHERE id = ?`,
      [id]
    );
    if (result.affectedRows === 0) {
      return null;
    }
    return this.findById(id);
  }
}

export default new AssignmentService();

