-- Publisher Payment System Migration
-- Creates tables for publisher earnings, payment cycles, invoices, and payment methods

-- 1. Payment Methods (bank, PayPal, crypto, etc.)
CREATE TABLE IF NOT EXISTS payment_methods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  publisher_id INT NOT NULL,
  method_type ENUM('bank', 'paypal', 'crypto', 'wire', 'check') NOT NULL,
  account_name VARCHAR(255),
  account_number VARCHAR(255),
  routing_number VARCHAR(100),
  bank_name VARCHAR(255),
  bank_address TEXT,
  paypal_email VARCHAR(255),
  crypto_address VARCHAR(255),
  crypto_type VARCHAR(50),
  swift_code VARCHAR(50),
  iban VARCHAR(100),
  is_default TINYINT(1) DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_methods_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE CASCADE,
  KEY idx_payment_methods_publisher (publisher_id),
  KEY idx_payment_methods_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Payment Cycles (NET7, NET15, NET30, weekly, monthly)
CREATE TABLE IF NOT EXISTS publisher_payment_cycles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  publisher_id INT NOT NULL UNIQUE,
  cycle_type ENUM('weekly', 'biweekly', 'monthly', 'net7', 'net15', 'net30') NOT NULL DEFAULT 'net30',
  cycle_start_day INT COMMENT 'Day of week (1-7) for weekly, day of month (1-31) for monthly',
  minimum_payout DECIMAL(10,2) DEFAULT 50.00,
  currency VARCHAR(10) DEFAULT 'USD',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payment_cycles_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE CASCADE,
  KEY idx_payment_cycles_publisher (publisher_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Publisher Earnings (aggregated earnings per period)
CREATE TABLE IF NOT EXISTS publisher_earnings (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  publisher_id INT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_clicks INT DEFAULT 0,
  total_conversions INT DEFAULT 0,
  approved_conversions INT DEFAULT 0,
  pending_conversions INT DEFAULT 0,
  rejected_conversions INT DEFAULT 0,
  total_revenue DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Total revenue from conversions',
  approved_revenue DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Revenue from approved conversions only',
  pending_revenue DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Revenue from pending conversions',
  total_payout DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Total payout amount',
  approved_payout DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Payout from approved conversions',
  pending_payout DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Payout from pending conversions',
  currency VARCHAR(10) DEFAULT 'USD',
  status ENUM('pending', 'processing', 'paid', 'cancelled') DEFAULT 'pending',
  invoice_id INT NULL,
  payment_id INT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_earnings_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE CASCADE,
  CONSTRAINT fk_earnings_invoice FOREIGN KEY (invoice_id) REFERENCES publisher_invoices(id) ON DELETE SET NULL,
  KEY idx_earnings_publisher (publisher_id),
  KEY idx_earnings_period (period_start, period_end),
  KEY idx_earnings_status (status),
  UNIQUE KEY uniq_publisher_period (publisher_id, period_start, period_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Publisher Invoices
CREATE TABLE IF NOT EXISTS publisher_invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_number VARCHAR(50) NOT NULL UNIQUE,
  publisher_id INT NOT NULL,
  earnings_id BIGINT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  tax DECIMAL(10,2) DEFAULT 0.00,
  total_amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  status ENUM('draft', 'pending', 'approved', 'paid', 'cancelled') DEFAULT 'draft',
  payment_method_id INT NULL,
  paid_at TIMESTAMP NULL,
  due_date DATE,
  notes TEXT,
  invoice_pdf_path VARCHAR(500) NULL COMMENT 'Path to generated PDF',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_invoices_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE CASCADE,
  CONSTRAINT fk_invoices_earnings FOREIGN KEY (earnings_id) REFERENCES publisher_earnings(id) ON DELETE CASCADE,
  CONSTRAINT fk_invoices_payment_method FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE SET NULL,
  KEY idx_invoices_publisher (publisher_id),
  KEY idx_invoices_status (status),
  KEY idx_invoices_number (invoice_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Publisher Payments (actual payment transactions)
CREATE TABLE IF NOT EXISTS publisher_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  payment_number VARCHAR(50) NOT NULL UNIQUE,
  invoice_id INT NOT NULL,
  publisher_id INT NOT NULL,
  payment_method_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  status ENUM('pending', 'processing', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
  transaction_id VARCHAR(255) NULL COMMENT 'External transaction ID',
  payment_date DATE NULL,
  processed_at TIMESTAMP NULL,
  failure_reason TEXT,
  admin_notes TEXT,
  created_by INT NULL COMMENT 'Admin user who created the payment',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payments_invoice FOREIGN KEY (invoice_id) REFERENCES publisher_invoices(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_method FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) ON DELETE RESTRICT,
  CONSTRAINT fk_payments_admin FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL,
  KEY idx_payments_publisher (publisher_id),
  KEY idx_payments_status (status),
  KEY idx_payments_number (payment_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Publisher Balance (current balance tracking)
CREATE TABLE IF NOT EXISTS publisher_balance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  publisher_id INT NOT NULL UNIQUE,
  available_balance DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Approved earnings available for payout',
  pending_balance DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Pending earnings not yet approved',
  total_earned DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Total lifetime earnings',
  total_paid DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Total lifetime payments',
  currency VARCHAR(10) DEFAULT 'USD',
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_balance_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE CASCADE,
  KEY idx_balance_publisher (publisher_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. Payment Approval Workflow (admin approval tracking)
CREATE TABLE IF NOT EXISTS payment_approvals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT NOT NULL,
  payment_id INT NULL,
  requested_by INT NULL COMMENT 'Admin who requested approval',
  approved_by INT NULL COMMENT 'Admin who approved',
  rejected_by INT NULL COMMENT 'Admin who rejected',
  status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
  approval_notes TEXT,
  rejection_reason TEXT,
  requested_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  approved_at TIMESTAMP NULL,
  rejected_at TIMESTAMP NULL,
  CONSTRAINT fk_approvals_invoice FOREIGN KEY (invoice_id) REFERENCES publisher_invoices(id) ON DELETE CASCADE,
  CONSTRAINT fk_approvals_payment FOREIGN KEY (payment_id) REFERENCES publisher_payments(id) ON DELETE SET NULL,
  CONSTRAINT fk_approvals_requested FOREIGN KEY (requested_by) REFERENCES admin_users(id) ON DELETE SET NULL,
  CONSTRAINT fk_approvals_approved FOREIGN KEY (approved_by) REFERENCES admin_users(id) ON DELETE SET NULL,
  CONSTRAINT fk_approvals_rejected FOREIGN KEY (rejected_by) REFERENCES admin_users(id) ON DELETE SET NULL,
  KEY idx_approvals_invoice (invoice_id),
  KEY idx_approvals_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Fix foreign key reference issue (earnings references invoices, but invoices reference earnings)
-- We'll use a deferred approach: create invoices first, then link earnings

ALTER TABLE publisher_earnings DROP FOREIGN KEY IF EXISTS fk_earnings_invoice;

-- Create index for invoice number generation
CREATE INDEX IF NOT EXISTS idx_invoices_created ON publisher_invoices(created_at);

-- Insert default payment cycles for existing publishers
INSERT INTO publisher_payment_cycles (publisher_id, cycle_type, cycle_start_day, minimum_payout, currency)
SELECT id, 'net30', 1, 50.00, 'USD'
FROM publishers
WHERE id NOT IN (SELECT publisher_id FROM publisher_payment_cycles)
ON DUPLICATE KEY UPDATE publisher_id = publisher_id;

-- Initialize publisher balances
INSERT INTO publisher_balance (publisher_id, available_balance, pending_balance, total_earned, total_paid, currency)
SELECT id, 0.00, 0.00, 0.00, 0.00, 'USD'
FROM publishers
WHERE id NOT IN (SELECT publisher_id FROM publisher_balance)
ON DUPLICATE KEY UPDATE publisher_id = publisher_id;
