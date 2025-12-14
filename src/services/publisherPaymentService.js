import pool from '../db/connection.js';
import logger from '../utils/logger.js';

export class PublisherPaymentService {
  /**
   * Calculate earnings for a publisher for a given period
   */
  async calculateEarnings(publisherId, periodStart, periodEnd) {
    try {
      // Get all conversions for this period
      const [convRows] = await pool.query(
        `SELECT 
          COUNT(*) as total_conversions,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_conversions,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_conversions,
          SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_conversions,
          COALESCE(SUM(amount), 0) as total_revenue,
          COALESCE(SUM(CASE WHEN status = 'approved' THEN amount ELSE 0 END), 0) as approved_revenue,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as pending_revenue,
          COALESCE(SUM(payout), 0) as total_payout,
          COALESCE(SUM(CASE WHEN status = 'approved' THEN payout ELSE 0 END), 0) as approved_payout,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN payout ELSE 0 END), 0) as pending_payout
         FROM conversions
         WHERE publisher_id = ? 
         AND DATE(created_at) >= ? 
         AND DATE(created_at) <= ?
         AND is_fraud = 0`,
        [publisherId, periodStart, periodEnd]
      );

      const stats = Array.isArray(convRows) ? convRows[0] : convRows;

      // Get clicks count
      const [clickRows] = await pool.query(
        `SELECT COUNT(*) as total_clicks
         FROM clicks
         WHERE publisher_id = ?
         AND DATE(created_at) >= ?
         AND DATE(created_at) <= ?`,
        [publisherId, periodStart, periodEnd]
      );

      const clickStats = Array.isArray(clickRows) ? clickRows[0] : clickRows;

      return {
        total_clicks: parseInt(clickStats.total_clicks || 0),
        total_conversions: parseInt(stats.total_conversions || 0),
        approved_conversions: parseInt(stats.approved_conversions || 0),
        pending_conversions: parseInt(stats.pending_conversions || 0),
        rejected_conversions: parseInt(stats.rejected_conversions || 0),
        total_revenue: parseFloat(stats.total_revenue || 0),
        approved_revenue: parseFloat(stats.approved_revenue || 0),
        pending_revenue: parseFloat(stats.pending_revenue || 0),
        total_payout: parseFloat(stats.total_payout || 0),
        approved_payout: parseFloat(stats.approved_payout || 0),
        pending_payout: parseFloat(stats.pending_payout || 0),
      };
    } catch (error) {
      logger.error('PublisherPaymentService.calculateEarnings error:', error);
      throw error;
    }
  }

  /**
   * Create or update earnings record for a period
   */
  async createOrUpdateEarnings(publisherId, periodStart, periodEnd) {
    try {
      const earnings = await this.calculateEarnings(publisherId, periodStart, periodEnd);

      // Get publisher currency
      const [pubRows] = await pool.query('SELECT * FROM publisher_payment_cycles WHERE publisher_id = ?', [publisherId]);
      const cycle = Array.isArray(pubRows) ? pubRows[0] : pubRows;
      const currency = cycle?.currency || 'USD';

      // Upsert earnings
      await pool.query(
        `INSERT INTO publisher_earnings (
          publisher_id, period_start, period_end,
          total_clicks, total_conversions, approved_conversions, pending_conversions, rejected_conversions,
          total_revenue, approved_revenue, pending_revenue,
          total_payout, approved_payout, pending_payout,
          currency, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        ON DUPLICATE KEY UPDATE
          total_clicks = VALUES(total_clicks),
          total_conversions = VALUES(total_conversions),
          approved_conversions = VALUES(approved_conversions),
          pending_conversions = VALUES(pending_conversions),
          rejected_conversions = VALUES(rejected_conversions),
          total_revenue = VALUES(total_revenue),
          approved_revenue = VALUES(approved_revenue),
          pending_revenue = VALUES(pending_revenue),
          total_payout = VALUES(total_payout),
          approved_payout = VALUES(approved_payout),
          pending_payout = VALUES(pending_payout),
          updated_at = NOW()`,
        [
          publisherId,
          periodStart,
          periodEnd,
          earnings.total_clicks,
          earnings.total_conversions,
          earnings.approved_conversions,
          earnings.pending_conversions,
          earnings.rejected_conversions,
          earnings.total_revenue,
          earnings.approved_revenue,
          earnings.pending_revenue,
          earnings.total_payout,
          earnings.approved_payout,
          earnings.pending_payout,
          currency,
        ]
      );

      // Get the earnings record
      const [rows] = await pool.query(
        `SELECT * FROM publisher_earnings 
         WHERE publisher_id = ? AND period_start = ? AND period_end = ?`,
        [publisherId, periodStart, periodEnd]
      );
      return Array.isArray(rows) ? rows[0] : rows;
    } catch (error) {
      logger.error('PublisherPaymentService.createOrUpdateEarnings error:', error);
      throw error;
    }
  }

  /**
   * Generate invoice number
   */
  generateInvoiceNumber() {
    const prefix = 'INV';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }

  /**
   * Create invoice from earnings
   */
  async createInvoice(earningsId, adminUserId = null) {
    try {
      // Get earnings
      const [earnRows] = await pool.query('SELECT * FROM publisher_earnings WHERE id = ?', [earningsId]);
      const earnings = Array.isArray(earnRows) ? earnRows[0] : earnRows;

      if (!earnings) {
        throw new Error('Earnings record not found');
      }

      // Check if invoice already exists
      if (earnings.invoice_id) {
        const [invRows] = await pool.query('SELECT * FROM publisher_invoices WHERE id = ?', [earnings.invoice_id]);
        return Array.isArray(invRows) ? invRows[0] : invRows;
      }

      // Generate invoice number
      const invoiceNumber = this.generateInvoiceNumber();

      // Calculate totals (use approved payout as subtotal)
      const subtotal = parseFloat(earnings.approved_payout || 0);
      const tax = 0; // Can be configured per publisher/country
      const totalAmount = subtotal + tax;

      // Calculate due date based on payment cycle
      const [cycleRows] = await pool.query(
        'SELECT * FROM publisher_payment_cycles WHERE publisher_id = ?',
        [earnings.publisher_id]
      );
      const cycle = Array.isArray(cycleRows) ? cycleRows[0] : cycleRows;

      let dueDate = new Date(earnings.period_end);
      if (cycle?.cycle_type === 'net7') {
        dueDate.setDate(dueDate.getDate() + 7);
      } else if (cycle?.cycle_type === 'net15') {
        dueDate.setDate(dueDate.getDate() + 15);
      } else if (cycle?.cycle_type === 'net30') {
        dueDate.setDate(dueDate.getDate() + 30);
      } else {
        dueDate.setDate(dueDate.getDate() + 30); // Default NET30
      }

      // Create invoice
      const [result] = await pool.query(
        `INSERT INTO publisher_invoices (
          invoice_number, publisher_id, earnings_id,
          period_start, period_end,
          subtotal, tax, total_amount, currency,
          status, due_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
        [
          invoiceNumber,
          earnings.publisher_id,
          earningsId,
          earnings.period_start,
          earnings.period_end,
          subtotal,
          tax,
          totalAmount,
          earnings.currency,
          dueDate.toISOString().split('T')[0],
        ]
      );

      const insertId = result.insertId || result[0]?.insertId;

      // Update earnings with invoice_id
      await pool.query('UPDATE publisher_earnings SET invoice_id = ? WHERE id = ?', [insertId, earningsId]);

      // Get created invoice
      const [invRows] = await pool.query('SELECT * FROM publisher_invoices WHERE id = ?', [insertId]);
      const invoice = Array.isArray(invRows) ? invRows[0] : invRows;

      return invoice;
    } catch (error) {
      logger.error('PublisherPaymentService.createInvoice error:', error);
      throw error;
    }
  }

  /**
   * Update publisher balance
   */
  async updatePublisherBalance(publisherId) {
    try {
      // Calculate available balance (approved earnings not yet paid)
      const [availRows] = await pool.query(
        `SELECT COALESCE(SUM(approved_payout), 0) as available
         FROM publisher_earnings
         WHERE publisher_id = ? AND status IN ('pending', 'processing')`,
        [publisherId]
      );
      const available = parseFloat((Array.isArray(availRows) ? availRows[0] : availRows).available || 0);

      // Calculate pending balance
      const [pendingRows] = await pool.query(
        `SELECT COALESCE(SUM(pending_payout), 0) as pending
         FROM publisher_earnings
         WHERE publisher_id = ? AND status = 'pending'`,
        [publisherId]
      );
      const pending = parseFloat((Array.isArray(pendingRows) ? pendingRows[0] : pendingRows).pending || 0);

      // Calculate total earned
      const [earnedRows] = await pool.query(
        `SELECT COALESCE(SUM(approved_payout), 0) as total
         FROM publisher_earnings
         WHERE publisher_id = ?`,
        [publisherId]
      );
      const totalEarned = parseFloat((Array.isArray(earnedRows) ? earnedRows[0] : earnedRows).total || 0);

      // Calculate total paid
      const [paidRows] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) as total
         FROM publisher_payments
         WHERE publisher_id = ? AND status = 'completed'`,
        [publisherId]
      );
      const totalPaid = parseFloat((Array.isArray(paidRows) ? paidRows[0] : paidRows).total || 0);

      // Get currency
      const [cycleRows] = await pool.query(
        'SELECT currency FROM publisher_payment_cycles WHERE publisher_id = ?',
        [publisherId]
      );
      const cycle = Array.isArray(cycleRows) ? cycleRows[0] : cycleRows;
      const currency = cycle?.currency || 'USD';

      // Update balance
      await pool.query(
        `INSERT INTO publisher_balance (
          publisher_id, available_balance, pending_balance, total_earned, total_paid, currency
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          available_balance = VALUES(available_balance),
          pending_balance = VALUES(pending_balance),
          total_earned = VALUES(total_earned),
          total_paid = VALUES(total_paid),
          last_updated = NOW()`,
        [publisherId, available, pending, totalEarned, totalPaid, currency]
      );

      return {
        available_balance: available,
        pending_balance: pending,
        total_earned: totalEarned,
        total_paid: totalPaid,
        currency,
      };
    } catch (error) {
      logger.error('PublisherPaymentService.updatePublisherBalance error:', error);
      throw error;
    }
  }

  /**
   * Get publisher balance
   */
  async getPublisherBalance(publisherId) {
    try {
      const [rows] = await pool.query('SELECT * FROM publisher_balance WHERE publisher_id = ?', [publisherId]);
      const balance = Array.isArray(rows) ? rows[0] : rows;

      if (!balance) {
        // Initialize balance if doesn't exist
        return await this.updatePublisherBalance(publisherId);
      }

      return {
        available_balance: parseFloat(balance.available_balance || 0),
        pending_balance: parseFloat(balance.pending_balance || 0),
        total_earned: parseFloat(balance.total_earned || 0),
        total_paid: parseFloat(balance.total_paid || 0),
        currency: balance.currency || 'USD',
        last_updated: balance.last_updated,
      };
    } catch (error) {
      logger.error('PublisherPaymentService.getPublisherBalance error:', error);
      throw error;
    }
  }

  /**
   * Process payment cycle (calculate earnings for all publishers)
   */
  async processPaymentCycle(cycleType, periodStart, periodEnd) {
    try {
      // Get all publishers with this cycle type
      const [rows] = await pool.query(
        'SELECT publisher_id FROM publisher_payment_cycles WHERE cycle_type = ?',
        [cycleType]
      );
      const publishers = Array.isArray(rows) ? rows : [];

      const results = [];

      for (const pub of publishers) {
        try {
          const earnings = await this.createOrUpdateEarnings(pub.publisher_id, periodStart, periodEnd);
          await this.updatePublisherBalance(pub.publisher_id);
          results.push({
            publisher_id: pub.publisher_id,
            success: true,
            earnings_id: earnings.id,
          });
        } catch (error) {
          logger.error(`Error processing earnings for publisher ${pub.publisher_id}:`, error);
          results.push({
            publisher_id: pub.publisher_id,
            success: false,
            error: error.message,
          });
        }
      }

      return results;
    } catch (error) {
      logger.error('PublisherPaymentService.processPaymentCycle error:', error);
      throw error;
    }
  }

  /**
   * Generate payment number
   */
  generatePaymentNumber() {
    const prefix = 'PAY';
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `${prefix}-${timestamp}-${random}`;
  }

  /**
   * Create payment from invoice
   */
  async createPayment(invoiceId, paymentMethodId, adminUserId) {
    try {
      // Get invoice
      const [invRows] = await pool.query('SELECT * FROM publisher_invoices WHERE id = ?', [invoiceId]);
      const invoice = Array.isArray(invRows) ? invRows[0] : invRows;

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      if (invoice.status === 'paid') {
        throw new Error('Invoice already paid');
      }

      // Generate payment number
      const paymentNumber = this.generatePaymentNumber();

      // Create payment
      const [result] = await pool.query(
        `INSERT INTO publisher_payments (
          payment_number, invoice_id, publisher_id, payment_method_id,
          amount, currency, status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
        [
          paymentNumber,
          invoiceId,
          invoice.publisher_id,
          paymentMethodId,
          invoice.total_amount,
          invoice.currency,
          adminUserId,
        ]
      );

      const insertId = result.insertId || result[0]?.insertId;

      // Update invoice status
      await pool.query(
        'UPDATE publisher_invoices SET status = ?, updated_at = NOW() WHERE id = ?',
        ['pending', invoiceId]
      );

      // Update earnings status
      await pool.query(
        'UPDATE publisher_earnings SET payment_id = ?, status = ?, updated_at = NOW() WHERE invoice_id = ?',
        [insertId, 'processing', invoiceId]
      );

      // Get created payment
      const [payRows] = await pool.query('SELECT * FROM publisher_payments WHERE id = ?', [insertId]);
      return Array.isArray(payRows) ? payRows[0] : payRows;
    } catch (error) {
      logger.error('PublisherPaymentService.createPayment error:', error);
      throw error;
    }
  }

  /**
   * Mark payment as completed
   */
  async completePayment(paymentId, transactionId = null) {
    try {
      await pool.query(
        `UPDATE publisher_payments 
         SET status = 'completed', transaction_id = ?, processed_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        [transactionId, paymentId]
      );

      // Get payment
      const [payRows] = await pool.query('SELECT * FROM publisher_payments WHERE id = ?', [paymentId]);
      const payment = Array.isArray(payRows) ? payRows[0] : payRows;

      // Update invoice status
      await pool.query(
        `UPDATE publisher_invoices 
         SET status = 'paid', paid_at = NOW(), updated_at = NOW()
         WHERE id = ?`,
        [payment.invoice_id]
      );

      // Update earnings status
      await pool.query(
        'UPDATE publisher_earnings SET status = ?, updated_at = NOW() WHERE payment_id = ?',
        ['paid', paymentId]
      );

      // Update publisher balance
      await this.updatePublisherBalance(payment.publisher_id);

      return payment;
    } catch (error) {
      logger.error('PublisherPaymentService.completePayment error:', error);
      throw error;
    }
  }

  /**
   * Get earnings for publisher
   */
  async getEarnings(publisherId, filters = {}) {
    try {
      let query = `SELECT e.*, 
                          i.invoice_number, i.status as invoice_status,
                          p.payment_number, p.status as payment_status
                   FROM publisher_earnings e
                   LEFT JOIN publisher_invoices i ON e.invoice_id = i.id
                   LEFT JOIN publisher_payments p ON e.payment_id = p.id
                   WHERE e.publisher_id = ?`;
      const params = [publisherId];

      if (filters.status) {
        query += ` AND e.status = ?`;
        params.push(filters.status);
      }

      if (filters.start_date) {
        query += ` AND e.period_start >= ?`;
        params.push(filters.start_date);
      }

      if (filters.end_date) {
        query += ` AND e.period_end <= ?`;
        params.push(filters.end_date);
      }

      query += ` ORDER BY e.period_start DESC LIMIT ? OFFSET ?`;
      params.push(filters.limit || 50, filters.offset || 0);

      const [rows] = await pool.query(query, params);
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      logger.error('PublisherPaymentService.getEarnings error:', error);
      throw error;
    }
  }
}

export default new PublisherPaymentService();
