-- Advertiser Billing System Migration
-- Creates tables for advertiser invoices, billing cycles, and revenue recognition

-- 1. Advertiser Billing Cycles
CREATE TABLE IF NOT EXISTS advertiser_billing_cycles (
  id INT AUTO_INCREMENT PRIMARY KEY,
  advertiser_id INT NOT NULL UNIQUE,
  cycle_type ENUM('monthly', 'weekly', 'net15', 'net30', 'net45') NOT NULL DEFAULT 'net30',
  billing_day INT COMMENT 'Day of month for monthly billing',
  currency VARCHAR(10) DEFAULT 'USD',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_billing_cycles_advertiser FOREIGN KEY (advertiser_id) REFERENCES advertisers(id) ON DELETE CASCADE,
  KEY idx_billing_cycles_advertiser (advertiser_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Advertiser Revenue Aggregation (per period)
CREATE TABLE IF NOT EXISTS advertiser_revenue (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  advertiser_id INT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_clicks INT DEFAULT 0,
  total_conversions INT DEFAULT 0,
  billable_conversions INT DEFAULT 0 COMMENT 'Approved conversions that are billable',
  non_billable_conversions INT DEFAULT 0 COMMENT 'Rejected/pending conversions',
  total_revenue DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Total revenue from all conversions',
  billable_revenue DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Revenue from billable conversions only',
  non_billable_revenue DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Revenue from non-billable conversions',
  currency VARCHAR(10) DEFAULT 'USD',
  status ENUM('pending', 'invoiced', 'paid', 'cancelled') DEFAULT 'pending',
  invoice_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_revenue_advertiser FOREIGN KEY (advertiser_id) REFERENCES advertisers(id) ON DELETE CASCADE,
  CONSTRAINT fk_revenue_invoice FOREIGN KEY (invoice_id) REFERENCES advertiser_invoices(id) ON DELETE SET NULL,
  KEY idx_revenue_advertiser (advertiser_id),
  KEY idx_revenue_period (period_start, period_end),
  KEY idx_revenue_status (status),
  UNIQUE KEY uniq_advertiser_period (advertiser_id, period_start, period_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Advertiser Invoices
CREATE TABLE IF NOT EXISTS advertiser_invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_number VARCHAR(50) NOT NULL UNIQUE,
  advertiser_id INT NOT NULL,
  revenue_id BIGINT NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL COMMENT 'Billable revenue',
  tax DECIMAL(10,2) DEFAULT 0.00,
  discount DECIMAL(10,2) DEFAULT 0.00,
  total_amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  status ENUM('draft', 'sent', 'paid', 'overdue', 'cancelled') DEFAULT 'draft',
  due_date DATE,
  paid_at TIMESTAMP NULL,
  invoice_pdf_path VARCHAR(500) NULL COMMENT 'Path to generated PDF',
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_adv_invoices_advertiser FOREIGN KEY (advertiser_id) REFERENCES advertisers(id) ON DELETE CASCADE,
  CONSTRAINT fk_adv_invoices_revenue FOREIGN KEY (revenue_id) REFERENCES advertiser_revenue(id) ON DELETE CASCADE,
  KEY idx_adv_invoices_advertiser (advertiser_id),
  KEY idx_adv_invoices_status (status),
  KEY idx_adv_invoices_number (invoice_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Advertiser Payments
CREATE TABLE IF NOT EXISTS advertiser_payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  payment_number VARCHAR(50) NOT NULL UNIQUE,
  invoice_id INT NOT NULL,
  advertiser_id INT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  payment_method VARCHAR(100) COMMENT 'wire, check, ACH, etc.',
  status ENUM('pending', 'processing', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
  transaction_id VARCHAR(255) NULL COMMENT 'External transaction ID',
  payment_date DATE NULL,
  processed_at TIMESTAMP NULL,
  failure_reason TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_adv_payments_invoice FOREIGN KEY (invoice_id) REFERENCES advertiser_invoices(id) ON DELETE CASCADE,
  CONSTRAINT fk_adv_payments_advertiser FOREIGN KEY (advertiser_id) REFERENCES advertisers(id) ON DELETE CASCADE,
  KEY idx_adv_payments_advertiser (advertiser_id),
  KEY idx_adv_payments_status (status),
  KEY idx_adv_payments_number (payment_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Advertiser Balance
CREATE TABLE IF NOT EXISTS advertiser_balance (
  id INT AUTO_INCREMENT PRIMARY KEY,
  advertiser_id INT NOT NULL UNIQUE,
  total_billed DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Total amount invoiced',
  total_paid DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Total amount paid',
  outstanding_balance DECIMAL(10,2) DEFAULT 0.00 COMMENT 'Unpaid invoices',
  currency VARCHAR(10) DEFAULT 'USD',
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_adv_balance_advertiser FOREIGN KEY (advertiser_id) REFERENCES advertisers(id) ON DELETE CASCADE,
  KEY idx_adv_balance_advertiser (advertiser_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Fix foreign key reference (similar to publisher earnings)
ALTER TABLE advertiser_revenue DROP FOREIGN KEY IF EXISTS fk_revenue_invoice;

-- Initialize billing cycles for existing advertisers
INSERT INTO advertiser_billing_cycles (advertiser_id, cycle_type, billing_day, currency)
SELECT id, 'net30', 1, 'USD'
FROM advertisers
WHERE id NOT IN (SELECT advertiser_id FROM advertiser_billing_cycles)
ON DUPLICATE KEY UPDATE advertiser_id = advertiser_id;

-- Initialize advertiser balances
INSERT INTO advertiser_balance (advertiser_id, total_billed, total_paid, outstanding_balance, currency)
SELECT id, 0.00, 0.00, 0.00, 'USD'
FROM advertisers
WHERE id NOT IN (SELECT advertiser_id FROM advertiser_balance)
ON DUPLICATE KEY UPDATE advertiser_id = advertiser_id;
