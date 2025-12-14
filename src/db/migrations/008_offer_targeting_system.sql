-- Offer Targeting Rule Engine Migration
-- Enhances offers table with advanced targeting rules and creates rule evaluation logs

-- 1. Offer Targeting Rules (extends offers table with rule configuration)
-- Note: Most targeting fields already exist in offers table, this adds rule evaluation order and logs

-- 2. Targeting Rule Evaluation Logs
CREATE TABLE IF NOT EXISTS targeting_rule_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  click_id BIGINT NULL,
  offer_id INT NOT NULL,
  publisher_id INT NOT NULL,
  rule_type VARCHAR(50) NOT NULL COMMENT 'geo, device, os, browser, connection, carrier, schedule, ip, publisher',
  rule_result ENUM('passed', 'failed', 'skipped') NOT NULL,
  rule_details JSON COMMENT 'Details about why rule passed/failed',
  evaluated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_targeting_logs_click FOREIGN KEY (click_id) REFERENCES clicks(id) ON DELETE SET NULL,
  CONSTRAINT fk_targeting_logs_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
  CONSTRAINT fk_targeting_logs_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE CASCADE,
  KEY idx_targeting_logs_offer (offer_id),
  KEY idx_targeting_logs_publisher (publisher_id),
  KEY idx_targeting_logs_result (rule_result),
  KEY idx_targeting_logs_evaluated (evaluated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Offer Schedule Rules (time-based targeting)
CREATE TABLE IF NOT EXISTS offer_schedules (
  id INT AUTO_INCREMENT PRIMARY KEY,
  offer_id INT NOT NULL,
  day_of_week INT COMMENT '0-6 (Sunday-Saturday), NULL for all days',
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  timezone VARCHAR(50) DEFAULT 'UTC',
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_schedules_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
  KEY idx_schedules_offer (offer_id),
  KEY idx_schedules_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Publisher-Specific Targeting Overrides
CREATE TABLE IF NOT EXISTS publisher_targeting_overrides (
  id INT AUTO_INCREMENT PRIMARY KEY,
  publisher_id INT NOT NULL,
  offer_id INT NULL COMMENT 'NULL for global publisher override',
  geo_allowed JSON COMMENT 'Override geo targeting',
  geo_blocked JSON COMMENT 'Block specific geos',
  device_allowed JSON COMMENT 'Override device targeting',
  device_blocked JSON COMMENT 'Block specific devices',
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_targeting_overrides_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE CASCADE,
  CONSTRAINT fk_targeting_overrides_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
  KEY idx_targeting_overrides_publisher (publisher_id),
  KEY idx_targeting_overrides_offer (offer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Add rule evaluation order to offers table
ALTER TABLE offers
ADD COLUMN IF NOT EXISTS targeting_rule_order VARCHAR(500) NULL COMMENT 'Comma-separated order: geo,device,os,browser,connection,carrier,schedule,ip,publisher',
ADD COLUMN IF NOT EXISTS targeting_strict_mode TINYINT(1) DEFAULT 0 COMMENT 'If 1, all rules must pass; if 0, any rule failure blocks';
