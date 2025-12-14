-- Admin Tools & Logging System Migration
-- Creates tables for change logs, tracking logs, postback logs, and audit trails

-- 1. Change Logs (track changes to offers, publishers, assignments, etc.)
CREATE TABLE IF NOT EXISTS change_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  entity_type ENUM('offer', 'publisher', 'assignment', 'advertiser', 'payment', 'invoice') NOT NULL,
  entity_id INT NOT NULL,
  action ENUM('create', 'update', 'delete', 'status_change', 'payout_change', 'url_change') NOT NULL,
  admin_user_id INT NOT NULL,
  field_name VARCHAR(100) NULL COMMENT 'Specific field that changed',
  old_value TEXT NULL,
  new_value TEXT NULL,
  change_summary TEXT COMMENT 'Human-readable summary of changes',
  metadata JSON COMMENT 'Additional context',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_change_logs_admin FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE CASCADE,
  KEY idx_change_logs_entity (entity_type, entity_id),
  KEY idx_change_logs_admin (admin_user_id),
  KEY idx_change_logs_action (action),
  KEY idx_change_logs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Tracking Logs (comprehensive click/conversion logging)
CREATE TABLE IF NOT EXISTS tracking_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  event_type ENUM('click', 'impression', 'conversion') NOT NULL,
  click_id BIGINT NULL,
  conversion_id BIGINT NULL,
  offer_id INT NOT NULL,
  publisher_id INT NOT NULL,
  ip VARCHAR(45),
  user_agent TEXT,
  referrer TEXT,
  country VARCHAR(100),
  device_type VARCHAR(50),
  browser VARCHAR(100),
  os VARCHAR(100),
  status VARCHAR(50) COMMENT 'approved, rejected, pending, etc.',
  amount DECIMAL(10,2),
  payout DECIMAL(10,2),
  request_data JSON COMMENT 'Full request query/body',
  response_data JSON COMMENT 'Response data',
  processing_time_ms INT COMMENT 'Time taken to process',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tracking_logs_click FOREIGN KEY (click_id) REFERENCES clicks(id) ON DELETE SET NULL,
  CONSTRAINT fk_tracking_logs_conversion FOREIGN KEY (conversion_id) REFERENCES conversions(id) ON DELETE SET NULL,
  CONSTRAINT fk_tracking_logs_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
  CONSTRAINT fk_tracking_logs_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE CASCADE,
  KEY idx_tracking_logs_event (event_type),
  KEY idx_tracking_logs_offer (offer_id),
  KEY idx_tracking_logs_publisher (publisher_id),
  KEY idx_tracking_logs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Postback Logs (publisher callback logs)
CREATE TABLE IF NOT EXISTS postback_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  conversion_id BIGINT NOT NULL,
  publisher_id INT NOT NULL,
  callback_url TEXT NOT NULL,
  request_method VARCHAR(10) DEFAULT 'GET',
  request_payload TEXT COMMENT 'Full URL or POST body',
  response_status INT NULL,
  response_body TEXT,
  attempt_number INT DEFAULT 1,
  success TINYINT(1) DEFAULT 0,
  error_message TEXT,
  processing_time_ms INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_postback_logs_conversion FOREIGN KEY (conversion_id) REFERENCES conversions(id) ON DELETE CASCADE,
  CONSTRAINT fk_postback_logs_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE CASCADE,
  KEY idx_postback_logs_conversion (conversion_id),
  KEY idx_postback_logs_publisher (publisher_id),
  KEY idx_postback_logs_success (success),
  KEY idx_postback_logs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Admin Action Logs (audit trail for all admin actions)
CREATE TABLE IF NOT EXISTS admin_action_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  admin_user_id INT NOT NULL,
  action_type VARCHAR(100) NOT NULL COMMENT 'pause_publisher, reset_caps, reject_click, approve_conversion, etc.',
  target_type ENUM('offer', 'publisher', 'click', 'conversion', 'assignment', 'payment', 'invoice', 'system') NOT NULL,
  target_id INT NULL,
  action_details JSON COMMENT 'Details about the action',
  ip_address VARCHAR(45),
  user_agent TEXT,
  success TINYINT(1) DEFAULT 1,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_admin_action_logs_admin FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE CASCADE,
  KEY idx_admin_action_logs_admin (admin_user_id),
  KEY idx_admin_action_logs_type (action_type),
  KEY idx_admin_action_logs_target (target_type, target_id),
  KEY idx_admin_action_logs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. Admin Force Actions (track manual admin interventions)
CREATE TABLE IF NOT EXISTS admin_force_actions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  admin_user_id INT NOT NULL,
  action_type ENUM('pause_publisher_offer', 'reset_caps', 'reject_click', 'approve_conversion', 'reject_conversion', 'adjust_payout') NOT NULL,
  target_type ENUM('offer', 'publisher', 'click', 'conversion', 'assignment') NOT NULL,
  target_id INT NOT NULL,
  action_data JSON COMMENT 'Action-specific data',
  reason TEXT,
  expires_at TIMESTAMP NULL COMMENT 'For temporary actions',
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_force_actions_admin FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE CASCADE,
  KEY idx_force_actions_type (action_type),
  KEY idx_force_actions_target (target_type, target_id),
  KEY idx_force_actions_active (is_active),
  KEY idx_force_actions_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
