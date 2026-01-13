-- BNG MIS Reporting Portal - Final Database Schema (MySQL/MariaDB)
-- This schema includes all migrations applied (001-007)
-- UTC ENFORCEMENT: All timestamps stored as UTC only. Business logic converts to IST (+05:30) at query time.
SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- 1. Admin Users
-- UTC ENFORCEMENT: All timestamp columns store UTC only. Use UTC_TIMESTAMP() in INSERT/UPDATE statements.
CREATE TABLE IF NOT EXISTS admin_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Publishers (Affiliates)
CREATE TABLE IF NOT EXISTS publishers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  first_name VARCHAR(100),
  company_name VARCHAR(255),
  country VARCHAR(100),
  global_postback_url TEXT,
  status ENUM('pending','active','suspended') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_publishers_status (status),
  KEY idx_publishers_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Advertisers
CREATE TABLE IF NOT EXISTS advertisers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  company_name VARCHAR(150),
  country VARCHAR(100),
  website VARCHAR(255),
  notes TEXT,
  status ENUM('active','inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Offers (per required structure)
CREATE TABLE IF NOT EXISTS offers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  advertiser_id INT NOT NULL,

  name VARCHAR(150) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  status VARCHAR(20) DEFAULT 'draft' COMMENT 'Offer status: live, paused, or draft',
  offer_visibility VARCHAR(50) NULL DEFAULT NULL COMMENT 'Offer visibility setting: public, private, restricted, etc.',

  offer_currency VARCHAR(10) NOT NULL,
  country VARCHAR(100) NOT NULL,

  advertiser_model VARCHAR(50) NOT NULL,
  advertiser_amount DECIMAL(10,2) NOT NULL,
  affiliate_model VARCHAR(50) NOT NULL,
  affiliate_amount DECIMAL(10,2) NOT NULL,

  offer_url VARCHAR(500) NOT NULL,
  preview_url VARCHAR(500),
  token_type VARCHAR(100),
  macros_json JSON,

  start_date DATE,
  end_date DATE,
  start_time TIME,
  end_time TIME,

  ip_action VARCHAR(20),
  ip_list TEXT,
  device_targeting_json JSON,
  device_action VARCHAR(20) NULL DEFAULT NULL COMMENT 'Device targeting action: ALLOW or BLOCK',
  os_targeting_json JSON,
  os_action VARCHAR(20) NULL DEFAULT NULL COMMENT 'OS targeting action: ALLOW or BLOCK',
  browser_targeting_json JSON,
  browser_action VARCHAR(20) NULL DEFAULT NULL COMMENT 'Browser targeting action: ALLOW or BLOCK',
  isp_targeting_json JSON,
  carrier_targeting_json JSON,
  city_targeting_json JSON,

  capping_type VARCHAR(20) DEFAULT 'none' COMMENT 'Capping type: none, daily, weekly, or monthly',
  daily_cap INT,
  monthly_cap INT,
  total_cap INT,
  conversion_cap INT,
  capping_conversions_duration VARCHAR(20) NULL DEFAULT NULL COMMENT 'Conversion capping duration: daily, weekly, or monthly',
  budget_cap DECIMAL(10,2),
  advertiser_capping_budget_duration VARCHAR(20) NULL DEFAULT NULL COMMENT 'Advertiser budget capping duration: daily, weekly, or monthly',
  advertiser_capping_budget_amount DECIMAL(10,2) NULL DEFAULT NULL COMMENT 'Advertiser budget capping amount',
  advertiser_over_capping VARCHAR(50) NULL DEFAULT NULL COMMENT 'Advertiser over-capping action: pause, fallback, reject, etc.',
  affiliate_over_capping VARCHAR(50) NULL DEFAULT NULL COMMENT 'Affiliate over-capping action: pause, fallback, reject, etc.',
  cap_action VARCHAR(50),

  fallback_enabled TINYINT(1) DEFAULT 0,
  fallback_url VARCHAR(500),
  fallback_offer_id INT,

  advertiser_postback_url VARCHAR(500),
  advertiser_postback_method VARCHAR(10),
  advertiser_postback_macros_json JSON,
  system_postback_url VARCHAR(500),
  system_postback_method VARCHAR(10),
  system_postback_macros_json JSON,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  CONSTRAINT fk_offers_advertiser FOREIGN KEY (advertiser_id) REFERENCES advertisers(id),
  KEY idx_offers_visibility (offer_visibility),
  KEY idx_offers_advertiser_capping (advertiser_capping_budget_duration, advertiser_capping_budget_amount)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Publisher Offers (Assignments)
CREATE TABLE IF NOT EXISTS publisher_offers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  publisher_id INT NOT NULL,
  offer_id INT NOT NULL,
  payout_override DECIMAL(10,2),
  cap_override INT,
  conversion_approval_percentage DECIMAL(5,2) NULL DEFAULT NULL,
  capping_budget_duration VARCHAR(20) NULL DEFAULT NULL,
  capping_budget_amount DECIMAL(10,2) NULL DEFAULT NULL,
  capping_conversions_duration VARCHAR(20) NULL DEFAULT NULL,
  capping_conversions_amount INT NULL DEFAULT NULL,
  callback_url TEXT NULL DEFAULT NULL,
  destination_url TEXT NULL DEFAULT NULL,
  status ENUM('active','inactive','suspended') DEFAULT 'active',
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  notes TEXT,
  UNIQUE KEY uniq_publisher_offer (publisher_id, offer_id),
  CONSTRAINT fk_po_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE CASCADE,
  CONSTRAINT fk_po_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
  KEY idx_po_status (status),
  KEY idx_po_capping_budget (capping_budget_duration, capping_budget_amount),
  KEY idx_po_capping_conversions (capping_conversions_duration, capping_conversions_amount)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. Clicks
-- UTC ENFORCEMENT: timestamp and created_at store UTC only. Business logic uses CONVERT_TZ(created_at, '+00:00', '+05:30')
CREATE TABLE IF NOT EXISTS clicks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  click_uuid CHAR(36) NOT NULL DEFAULT (UUID()),
  offer_id INT NOT NULL,
  publisher_id INT NOT NULL,
  publisher_offer_id INT,
  ip VARCHAR(45),
  user_agent TEXT,
  referrer TEXT,
  country VARCHAR(100),
  region VARCHAR(100),
  city VARCHAR(100),
  isp VARCHAR(255),
  location JSON,
  domain VARCHAR(255),
  device_type VARCHAR(50),
  browser VARCHAR(100),
  os VARCHAR(100),
  os_version VARCHAR(50),
  device_brand VARCHAR(100),
  device_model VARCHAR(100),
  source_id VARCHAR(255),
  device_id VARCHAR(255),
  google_id VARCHAR(255),
  android_id VARCHAR(255),
  rcid VARCHAR(255),
  tid VARCHAR(255),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_click_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
  CONSTRAINT fk_click_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE CASCADE,
  CONSTRAINT fk_click_po FOREIGN KEY (publisher_offer_id) REFERENCES publisher_offers(id) ON DELETE SET NULL,
  KEY idx_clicks_offer (offer_id),
  KEY idx_clicks_publisher (publisher_id),
  KEY idx_clicks_timestamp (timestamp),
  KEY idx_clicks_rcid (rcid),
  KEY idx_clicks_tid (tid),
  KEY idx_clicks_uuid (click_uuid),
  KEY idx_clicks_country (country),
  KEY idx_clicks_device_type (device_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. Impressions
-- UTC ENFORCEMENT: timestamp and created_at store UTC only
CREATE TABLE IF NOT EXISTS impressions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  imp_uuid CHAR(36) NOT NULL DEFAULT (UUID()),
  offer_id INT NOT NULL,
  publisher_id INT NOT NULL,
  ip VARCHAR(45),
  user_agent TEXT,
  referrer TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_imp_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
  CONSTRAINT fk_imp_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE CASCADE,
  KEY idx_impressions_offer (offer_id),
  KEY idx_impressions_publisher (publisher_id),
  KEY idx_impressions_timestamp (timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. Conversions
-- UTC ENFORCEMENT: timestamp, created_at, updated_at store UTC only. Business logic uses CONVERT_TZ(created_at, '+00:00', '+05:30')
CREATE TABLE IF NOT EXISTS conversions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  conversion_uuid CHAR(36) NOT NULL DEFAULT (UUID()),
  click_uuid CHAR(36),
  offer_id INT NOT NULL,
  publisher_id INT NOT NULL,
  publisher_offer_id INT,
  rcid VARCHAR(255) NOT NULL,
  status ENUM('pending','approved','rejected','rejected_cap') DEFAULT 'pending',
  amount DECIMAL(10,2) NOT NULL,
  payout DECIMAL(10,2) NOT NULL,
  ip VARCHAR(45),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  postback_payload JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_rcid_offer (rcid, offer_id),
  CONSTRAINT fk_conv_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
  CONSTRAINT fk_conv_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE CASCADE,
  CONSTRAINT fk_conv_po FOREIGN KEY (publisher_offer_id) REFERENCES publisher_offers(id) ON DELETE SET NULL,
  KEY idx_conversions_status (status),
  KEY idx_conversions_timestamp (timestamp),
  UNIQUE KEY uniq_click_uuid (click_uuid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. Daily Offer Stats
-- UTC ENFORCEMENT: day column stores UTC date. created_at/updated_at store UTC. Use CONVERT_TZ(created_at, '+00:00', '+05:30') for IST display
CREATE TABLE IF NOT EXISTS daily_offer_stats (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  offer_id INT NOT NULL,
  day DATE NOT NULL,
  impressions INT DEFAULT 0,
  clicks INT DEFAULT 0,
  unique_clicks INT DEFAULT 0,
  conversions INT DEFAULT 0,
  revenue DECIMAL(10,2) DEFAULT 0,
  payout DECIMAL(10,2) DEFAULT 0,
  profit DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_offer_day (offer_id, day),
  CONSTRAINT fk_stats_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
  KEY idx_daily_stats_day (day)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed default admin (password hash corresponds to 'admin123')
INSERT INTO admin_users (email, name, password_hash, role)
VALUES ('admin@bng.com', 'Admin User', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'admin')
ON DUPLICATE KEY UPDATE email = email;