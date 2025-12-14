-- Fraud Detection System Migration
-- Creates tables for fraud detection, IP frequency checks, device tracking, blacklists, and fraud logs

-- 1. Fraud Rules (Publisher-level and Offer-level fraud rules)
CREATE TABLE IF NOT EXISTS fraud_rules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rule_type ENUM('publisher', 'offer', 'global') NOT NULL,
  publisher_id INT NULL,
  offer_id INT NULL,
  rule_name VARCHAR(255) NOT NULL,
  rule_config JSON NOT NULL COMMENT 'Contains rule-specific configuration (thresholds, actions, etc.)',
  action ENUM('reject_click', 'reject_conversion', 'flag_conversion', 'log_only') NOT NULL DEFAULT 'log_only',
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_fraud_rules_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE CASCADE,
  CONSTRAINT fk_fraud_rules_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
  KEY idx_fraud_rules_type (rule_type),
  KEY idx_fraud_rules_publisher (publisher_id),
  KEY idx_fraud_rules_offer (offer_id),
  KEY idx_fraud_rules_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. IP Frequency Tracking (for detecting suspicious IP activity)
CREATE TABLE IF NOT EXISTS ip_frequency_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ip VARCHAR(45) NOT NULL,
  offer_id INT NULL,
  publisher_id INT NULL,
  event_type ENUM('click', 'conversion') NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ip_freq_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
  CONSTRAINT fk_ip_freq_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE CASCADE,
  KEY idx_ip_freq_ip (ip),
  KEY idx_ip_freq_timestamp (timestamp),
  KEY idx_ip_freq_offer (offer_id),
  KEY idx_ip_freq_publisher (publisher_id),
  KEY idx_ip_freq_event (event_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Device ID Tracking (for detecting device duplication)
CREATE TABLE IF NOT EXISTS device_tracking (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_id VARCHAR(255) NOT NULL,
  device_fingerprint TEXT,
  offer_id INT NULL,
  publisher_id INT NULL,
  ip VARCHAR(45),
  user_agent TEXT,
  first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  click_count INT DEFAULT 0,
  conversion_count INT DEFAULT 0,
  CONSTRAINT fk_device_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE SET NULL,
  CONSTRAINT fk_device_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE SET NULL,
  KEY idx_device_id (device_id),
  KEY idx_device_offer (offer_id),
  KEY idx_device_publisher (publisher_id),
  KEY idx_device_last_seen (last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. User-Agent Blacklist
CREATE TABLE IF NOT EXISTS user_agent_blacklist (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pattern VARCHAR(500) NOT NULL COMMENT 'Regex pattern or exact match',
  match_type ENUM('exact', 'regex', 'contains') NOT NULL DEFAULT 'contains',
  reason TEXT,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_ua_blacklist_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. IP Blacklist/Whitelist (per offer or global)
CREATE TABLE IF NOT EXISTS ip_access_lists (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ip_address VARCHAR(45) NOT NULL,
  ip_range_start VARCHAR(45) NULL COMMENT 'For CIDR ranges',
  ip_range_end VARCHAR(45) NULL,
  list_type ENUM('blacklist', 'whitelist') NOT NULL,
  scope ENUM('global', 'offer', 'publisher') NOT NULL DEFAULT 'global',
  offer_id INT NULL,
  publisher_id INT NULL,
  reason TEXT,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_ip_access_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
  CONSTRAINT fk_ip_access_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE CASCADE,
  KEY idx_ip_access_ip (ip_address),
  KEY idx_ip_access_type (list_type),
  KEY idx_ip_access_scope (scope),
  KEY idx_ip_access_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. VPN/Proxy Detection Cache (can integrate with external APIs)
CREATE TABLE IF NOT EXISTS vpn_proxy_cache (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ip VARCHAR(45) NOT NULL UNIQUE,
  is_vpn TINYINT(1) DEFAULT 0,
  is_proxy TINYINT(1) DEFAULT 0,
  is_tor TINYINT(1) DEFAULT 0,
  provider VARCHAR(255),
  country VARCHAR(100),
  last_checked TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  KEY idx_vpn_ip (ip),
  KEY idx_vpn_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. Geo Mismatch Logs (IP country vs user-reported country)
CREATE TABLE IF NOT EXISTS geo_mismatch_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  click_id BIGINT NULL,
  conversion_id BIGINT NULL,
  ip VARCHAR(45) NOT NULL,
  ip_country VARCHAR(100),
  reported_country VARCHAR(100),
  mismatch_type ENUM('ip_vs_header', 'ip_vs_geo', 'header_vs_geo') NOT NULL,
  severity ENUM('low', 'medium', 'high') DEFAULT 'medium',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_geo_click FOREIGN KEY (click_id) REFERENCES clicks(id) ON DELETE SET NULL,
  CONSTRAINT fk_geo_conversion FOREIGN KEY (conversion_id) REFERENCES conversions(id) ON DELETE SET NULL,
  KEY idx_geo_ip (ip),
  KEY idx_geo_click (click_id),
  KEY idx_geo_conversion (conversion_id),
  KEY idx_geo_severity (severity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. Publisher Fraud Scores
CREATE TABLE IF NOT EXISTS publisher_fraud_scores (
  id INT AUTO_INCREMENT PRIMARY KEY,
  publisher_id INT NOT NULL UNIQUE,
  fraud_score DECIMAL(5,2) DEFAULT 0.00 COMMENT '0-100 score, higher = more fraud',
  risk_level ENUM('low', 'medium', 'high', 'critical') DEFAULT 'low',
  factors JSON COMMENT 'Array of fraud factors contributing to score',
  last_calculated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_fraud_score_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE CASCADE,
  KEY idx_fraud_score_publisher (publisher_id),
  KEY idx_fraud_score_risk (risk_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. Fraud Logs (comprehensive fraud event logging)
CREATE TABLE IF NOT EXISTS fraud_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_type ENUM('click_rejected', 'conversion_rejected', 'conversion_flagged', 'suspicious_activity') NOT NULL,
  click_id BIGINT NULL,
  conversion_id BIGINT NULL,
  offer_id INT NOT NULL,
  publisher_id INT NOT NULL,
  rule_id INT NULL COMMENT 'Which fraud rule triggered this',
  rejection_reason_code VARCHAR(50) NOT NULL,
  rejection_reason_text TEXT,
  ip VARCHAR(45),
  device_id VARCHAR(255),
  user_agent TEXT,
  fraud_score DECIMAL(5,2),
  metadata JSON COMMENT 'Additional context (IP frequency, device count, etc.)',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_fraud_logs_click FOREIGN KEY (click_id) REFERENCES clicks(id) ON DELETE SET NULL,
  CONSTRAINT fk_fraud_logs_conversion FOREIGN KEY (conversion_id) REFERENCES conversions(id) ON DELETE SET NULL,
  CONSTRAINT fk_fraud_logs_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
  CONSTRAINT fk_fraud_logs_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE CASCADE,
  CONSTRAINT fk_fraud_logs_rule FOREIGN KEY (rule_id) REFERENCES fraud_rules(id) ON DELETE SET NULL,
  KEY idx_fraud_logs_type (event_type),
  KEY idx_fraud_logs_offer (offer_id),
  KEY idx_fraud_logs_publisher (publisher_id),
  KEY idx_fraud_logs_reason (rejection_reason_code),
  KEY idx_fraud_logs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. Bot Detection Patterns
CREATE TABLE IF NOT EXISTS bot_patterns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pattern_name VARCHAR(255) NOT NULL,
  user_agent_pattern VARCHAR(500),
  ip_pattern VARCHAR(500),
  behavior_pattern JSON COMMENT 'Click patterns, timing patterns, etc.',
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_bot_patterns_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add fraud-related columns to clicks table
ALTER TABLE clicks 
ADD COLUMN IF NOT EXISTS fraud_checked TINYINT(1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS fraud_score DECIMAL(5,2) NULL,
ADD COLUMN IF NOT EXISTS is_fraud TINYINT(1) DEFAULT 0,
ADD KEY idx_clicks_fraud (is_fraud, fraud_checked);

-- Add fraud-related columns to conversions table
ALTER TABLE conversions
ADD COLUMN IF NOT EXISTS fraud_checked TINYINT(1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS fraud_score DECIMAL(5,2) NULL,
ADD COLUMN IF NOT EXISTS is_fraud TINYINT(1) DEFAULT 0,
ADD COLUMN IF NOT EXISTS fraud_reason_code VARCHAR(50) NULL,
ADD KEY idx_conversions_fraud (is_fraud, fraud_checked);

-- Insert default fraud rules
INSERT INTO fraud_rules (rule_type, rule_name, rule_config, action, is_active) VALUES
('global', 'IP Frequency Check', '{"max_clicks_per_hour": 100, "max_clicks_per_day": 1000, "max_conversions_per_hour": 10}', 'reject_click', 1),
('global', 'Device Duplication Check', '{"max_devices_per_ip": 5, "max_clicks_per_device_per_hour": 50}', 'reject_click', 1),
('global', 'VPN/Proxy Detection', '{"block_vpn": true, "block_proxy": true, "block_tor": true}', 'reject_click', 1),
('global', 'User-Agent Blacklist', '{"check_blacklist": true}', 'reject_click', 1),
('global', 'Geo Mismatch Detection', '{"severity_threshold": "high", "block_on_mismatch": true}', 'flag_conversion', 1)
ON DUPLICATE KEY UPDATE rule_name = rule_name;

-- Insert default bot patterns
INSERT INTO bot_patterns (pattern_name, user_agent_pattern, is_active) VALUES
('Google Bot', '%Googlebot%', 1),
('Bing Bot', '%bingbot%', 1),
('Yandex Bot', '%YandexBot%', 1),
('Empty User Agent', '^$', 1),
('Common Crawler', '%crawler%', 1)
ON DUPLICATE KEY UPDATE pattern_name = pattern_name;
