-- Security & Abuse Prevention Migration
-- Creates tables for API rate limiting, JWT rotation, signature validation, and IP throttling

-- 1. API Rate Limit Tracking
CREATE TABLE IF NOT EXISTS api_rate_limits (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  identifier VARCHAR(255) NOT NULL COMMENT 'IP address, user ID, or API key',
  endpoint VARCHAR(255) NOT NULL,
  request_count INT DEFAULT 1,
  window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  blocked_until TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_rate_limits_identifier (identifier, endpoint),
  KEY idx_rate_limits_window (window_start),
  KEY idx_rate_limits_blocked (blocked_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. JWT Token Rotation (track token versions)
CREATE TABLE IF NOT EXISTS jwt_token_versions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  user_type ENUM('admin', 'publisher', 'advertiser') NOT NULL,
  token_version INT DEFAULT 1 COMMENT 'Incremented on rotation',
  last_rotated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL,
  is_revoked TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_jwt_admin FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE,
  KEY idx_jwt_user (user_id, user_type),
  KEY idx_jwt_revoked (is_revoked)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Advertiser Postback Signatures (for signature validation)
CREATE TABLE IF NOT EXISTS advertiser_signatures (
  id INT AUTO_INCREMENT PRIMARY KEY,
  advertiser_id INT NOT NULL,
  secret_key VARCHAR(255) NOT NULL COMMENT 'HMAC secret for signature validation',
  algorithm VARCHAR(50) DEFAULT 'sha256',
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_signatures_advertiser FOREIGN KEY (advertiser_id) REFERENCES advertisers(id) ON DELETE CASCADE,
  KEY idx_signatures_advertiser (advertiser_id),
  KEY idx_signatures_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. IP Throttling (for click/conversion throttling)
CREATE TABLE IF NOT EXISTS ip_throttle_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  ip VARCHAR(45) NOT NULL,
  event_type ENUM('click', 'conversion', 'api') NOT NULL,
  endpoint VARCHAR(255) NULL,
  request_count INT DEFAULT 1,
  window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  blocked_until TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_throttle_ip (ip, event_type),
  KEY idx_throttle_window (window_start),
  KEY idx_throttle_blocked (blocked_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Secure Macro Parsing Logs (track macro replacements for security)
CREATE TABLE IF NOT EXISTS macro_parsing_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  click_id BIGINT NULL,
  conversion_id BIGINT NULL,
  macro_string TEXT NOT NULL COMMENT 'Original macro string',
  parsed_value TEXT COMMENT 'Parsed/replaced value',
  macro_type VARCHAR(50) COMMENT 'CLICK_ID, RCID, PAYOUT, etc.',
  security_flags JSON COMMENT 'Security warnings/flags',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_macro_logs_click FOREIGN KEY (click_id) REFERENCES clicks(id) ON DELETE SET NULL,
  CONSTRAINT fk_macro_logs_conversion FOREIGN KEY (conversion_id) REFERENCES conversions(id) ON DELETE SET NULL,
  KEY idx_macro_logs_click (click_id),
  KEY idx_macro_logs_conversion (conversion_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
