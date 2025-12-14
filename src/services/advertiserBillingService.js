import pool from '../db/connection.js';
import logger from '../utils/logger.js';

export class AdvertiserBillingService {
  /**
   * Calculate revenue for advertiser for a given period
   */
  async calculateRevenue(advertiserId, periodStart, periodEnd) {
    try {
      // Get all conversions for this advertiser's offers
      const [convRows] = await pool.query(
        `SELECT 
          COUNT(*) as total_conversions,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as billable_conversions,
          SUM(CASE WHEN status IN ('pending', 'rejected') THEN 1 ELSE 0 END) as non_billable_conversions,
          COALESCE(SUM(amount), 0) as total_revenue,
          COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) as billable_revenue,
          COALESCE(SUM(CASE WHEN status IN ('pending', 'rejected') THEN amount ELSE 0 END), 0) as non_billable_revenue
         FROM conversions c
         JOIN offers o ON c.offer_id = o.id
         WHERE o.advertiser_id = ?
         AND DATE(c.created_at) >= ?
         AND DATE(c.created_at) <= ?
         AND c.is_fraud = 0`,
        [advertiserId, periodStart, periodEnd]
      );

      const stats = Array.isArray(convRows) ? convRows[0] : convRows;

      // Get clicks count
      const [clickRows] = await pool.query(
        `SELECT COUNT(*) as total_clicks
         FROM clicks cl
         JOIN offers o ON cl.offer_id = o.id
         WHERE o.advertiser_id = ?
         AND DATE(cl.created_at) >= ?
         AND DATE(cl.created_at) <= ?`,
        [advertiserId, periodStart, periodEnd]
      );

      const clickStats = Array.isArray(clickRows) ? clickRows[0] : clickRows;

      return {
        total_clicks: parseInt(clickStats.total_clicks || 0),
        total_conversions: parseInt(stats.total_conversions || 0),
        billable_conversions: parseInt(stats.billable_conversions || 0),
        non_billable_conversions: parseInt(stats.non_billable_conversions || 0),
        total_revenue: parseFloat(stats.total_revenue || 0),
        billable_revenue: parseFloat(stats.billable_revenue || 0),
        non_billable_revenue: parseFloat(stats.non_billable_revenue || 0),
      };
    } catch (error) {
      logger.error('AdvertiserBillingService.calculateRevenue error:', error);
      throw error;
    }
  }

  /**
   * Create or update revenue record
   */
  async createOrUpdateRevenue(advertiserId, periodStart, periodEnd) {
    try {
      const revenue = await this.calculateRevenue(advertiserId, periodStart, periodEnd);

      // Get advertiser currency
      const [advRows] = await pool.query('SELECT * FROM advertiser_billing_cycles WHERE advertiser_id = ?', [advertiserId]);
      const cycle = Array.isArray(advRows) ? advRows[0] : advRows;
      const currency = cycle?.currency || 'USD';

      // Upsert revenue
      await pool.query(
        `INSERT INTO advertiser_revenue (
          advertiser_id, period_start, period_end,
          total_clicks, total_conversions, billable_conversions, non_billable_conversions,
          total_revenue, billable_revenue, non_billable_revenue,
          currency, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        ON DUPLICATE KEY UPDATE
          total_clicks = VALUES(total_clicks),
          total_conversions = VALUES(total_conversions),
          billable_conversions = VALUES(billable_conversions),
          non_billable_conversions = VALUES(non_billable_conversions),
          total_revenue = VALUES(total_revenue),
          billable_revenue = VALUES(billable_revenue),
          non_billable_revenue = VALUES(non_billable_revenue),
          updated_at = NOW()`,
        [
          advertiserId,
          periodStart,
          periodEnd,
          revenue.total_clicks,
          revenue.total_conversions,
          revenue.billable_conversions,
          revenue.non_billable_conversions,
          revenue.total_revenue,
          revenue.billable_revenue,
          revenue.non_billable_revenue,
          currency,
        ]
      );

      const [rows] = await pool.query(
        `SELECT * FROM advertiser_revenue 
         WHERE advertiser_id = ? AND period_start = ? AND period_end = ?`,
        [advertiserId, periodStart, periodEnd]
      );
      return Array.isArray(rows) ? rows[0] : rows;
    } catch (error) {
      logger.error('AdvertiserBillingService.createOrUpdateRevenue error:', error);
      throw error;
    }
  }

  /**
   * Generate invoice number
   */
  generateInvoiceNumber() {
    const prefix = 'ADV-INV';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }

  /**
   * Create invoice from revenue
   */
  async createInvoice(revenueId) {
    try {
      const [revRows] = await pool.query('SELECT * FROM advertiser_revenue WHERE id = ?', [revenueId]);
      const revenue = Array.isArray(revRows) ? revRows[0] : revRows;

      if (!revenue) {
        throw new Error('Revenue record not found');
      }

      if (revenue.invoice_id) {
        const [invRows] = await pool.query('SELECT * FROM advertiser_invoices WHERE id = ?', [revenue.invoice_id]);
        return Array.isArray(invRows) ? invRows[0] : invRows;
      }

      const invoiceNumber = this.generateInvoiceNumber();
      const subtotal = parseFloat(revenue.billable_revenue || 0);
      const tax = 0; // Can be configured
      const discount = 0; // Can be configured
      const totalAmount = subtotal + tax - discount;

      // Calculate due date
      const [cycleRows] = await pool.query(
        'SELECT * FROM advertiser_billing_cycles WHERE advertiser_id = ?',
        [revenue.advertiser_id]
      );
      const cycle = Array.isArray(cycleRows) ? cycleRows[0] : cycleRows;

      let dueDate = new Date(revenue.period_end);
      if (cycle?.cycle_type === 'net15') {
        dueDate.setDate(dueDate.getDate() + 15);
      } else if (cycle?.cycle_type === 'net30') {
        dueDate.setDate(dueDate.getDate() + 30);
      } else if (cycle?.cycle_type === 'net45') {
        dueDate.setDate(dueDate.getDate() + 45);
      } else {
        dueDate.setDate(dueDate.getDate() + 30);
      }

      const [result] = await pool.query(
        `INSERT INTO advertiser_invoices (
          invoice_number, advertiser_id, revenue_id,
          period_start, period_end,
          subtotal, tax, discount, total_amount, currency,
          status, due_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
        [
          invoiceNumber,
          revenue.advertiser_id,
          revenueId,
          revenue.period_start,
          revenue.period_end,
          subtotal,
          tax,
          discount,
          totalAmount,
          revenue.currency,
          dueDate.toISOString().split('T')[0],
        ]
      );

      const insertId = result.insertId || result[0]?.insertId;
      await pool.query('UPDATE advertiser_revenue SET invoice_id = ?, status = ? WHERE id = ?', 
        [insertId, 'invoiced', revenueId]);

      const [invRows] = await pool.query('SELECT * FROM advertiser_invoices WHERE id = ?', [insertId]);
      return Array.isArray(invRows) ? invRows[0] : invRows;
    } catch (error) {
      logger.error('AdvertiserBillingService.createInvoice error:', error);
      throw error;
    }
  }

  /**
   * Update advertiser balance
   */
  async updateAdvertiserBalance(advertiserId) {
    try {
      const [billedRows] = await pool.query(
        `SELECT COALESCE(SUM(total_amount), 0) as total
         FROM advertiser_invoices
         WHERE advertiser_id = ?`,
        [advertiserId]
      );
      const totalBilled = parseFloat((Array.isArray(billedRows) ? billedRows[0] : billedRows).total || 0);

      const [paidRows] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total
         FROM advertiser_payments
         WHERE advertiser_id = ? AND status = 'completed'`,
        [advertiserId]
      );
      const totalPaid = parseFloat((Array.isArray(paidRows) ? paidRows[0] : paidRows).total || 0);

      const outstanding = totalBilled - totalPaid;

      const [cycleRows] = await pool.query(
        'SELECT currency FROM advertiser_billing_cycles WHERE advertiser_id = ?',
        [advertiserId]
      );
      const cycle = Array.isArray(cycleRows) ? cycleRows[0] : cycleRows;
      const currency = cycle?.currency || 'USD';

      await pool.query(
        `INSERT INTO advertiser_balance (
          advertiser_id, total_billed, total_paid, outstanding_balance, currency
        ) VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          total_billed = VALUES(total_billed),
          total_paid = VALUES(total_paid),
          outstanding_balance = VALUES(outstanding_balance),
          last_updated = NOW()`,
        [advertiserId, totalBilled, totalPaid, outstanding, currency]
      );

      return { total_billed: totalBilled, total_paid: totalPaid, outstanding_balance: outstanding, currency };
    } catch (error) {
      logger.error('AdvertiserBillingService.updateAdvertiserBalance error:', error);
      throw error;
    }
  }

  /**
   * Get advertiser balance
   */
  async getAdvertiserBalance(advertiserId) {
    try {
      const [rows] = await pool.query('SELECT * FROM advertiser_balance WHERE advertiser_id = ?', [advertiserId]);
      const balance = Array.isArray(rows) ? rows[0] : rows;

      if (!balance) {
        return await this.updateAdvertiserBalance(advertiserId);
      }

      return {
        total_billed: parseFloat(balance.total_billed || 0),
        total_paid: parseFloat(balance.total_paid || 0),
        outstanding_balance: parseFloat(balance.outstanding_balance || 0),
        currency: balance.currency || 'USD',
        last_updated: balance.last_updated,
      };
    } catch (error) {
      logger.error('AdvertiserBillingService.getAdvertiserBalance error:', error);
      throw error;
    }
  }
}

export default new AdvertiserBillingService();
