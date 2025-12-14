-- Postback Retry & Queue System Migration
-- Creates tables for postback retry queue, attempts tracking, and failure management

-- Note: This system works with Redis/BullMQ for queue management, but stores persistent records in MySQL

-- 1. Postback Queue (persistent queue for failed postbacks)
CREATE TABLE IF NOT EXISTS postback_queue (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  conversion_id BIGINT NOT NULL,
  publisher_id INT NOT NULL,
  callback_url TEXT NOT NULL,
  request_method VARCHAR(10) DEFAULT 'GET',
  request_payload TEXT NOT NULL COMMENT 'Full URL or POST body',
  priority INT DEFAULT 5 COMMENT '1-10, higher = more priority',
  max_attempts INT DEFAULT 5,
  current_attempt INT DEFAULT 0,
  next_retry_at TIMESTAMP NULL,
  status ENUM('pending', 'processing', 'completed', 'failed', 'cancelled') DEFAULT 'pending',
  last_error TEXT,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_postback_queue_conversion FOREIGN KEY (conversion_id) REFERENCES conversions(id) ON DELETE CASCADE,
  CONSTRAINT fk_postback_queue_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE CASCADE,
  KEY idx_postback_queue_status (status),
  KEY idx_postback_queue_next_retry (next_retry_at),
  KEY idx_postback_queue_conversion (conversion_id),
  KEY idx_postback_queue_publisher (publisher_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Postback Attempts (detailed attempt history)
CREATE TABLE IF NOT EXISTS postback_attempts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  queue_id BIGINT NOT NULL,
  attempt_number INT NOT NULL,
  request_url TEXT NOT NULL,
  request_method VARCHAR(10) DEFAULT 'GET',
  request_payload TEXT,
  response_status INT NULL,
  response_body TEXT,
  response_time_ms INT,
  success TINYINT(1) DEFAULT 0,
  error_message TEXT,
  retry_after_seconds INT NULL COMMENT 'Calculated retry delay',
  attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_postback_attempts_queue FOREIGN KEY (queue_id) REFERENCES postback_queue(id) ON DELETE CASCADE,
  KEY idx_postback_attempts_queue (queue_id),
  KEY idx_postback_attempts_success (success),
  KEY idx_postback_attempts_attempted (attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Postback Failure Patterns (for learning and optimization)
CREATE TABLE IF NOT EXISTS postback_failure_patterns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  publisher_id INT NULL,
  callback_domain VARCHAR(255) NOT NULL,
  failure_type ENUM('timeout', 'connection_error', 'http_error', 'invalid_response', 'other') NOT NULL,
  error_code VARCHAR(100),
  failure_count INT DEFAULT 1,
  last_failure_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  is_permanent_failure TINYINT(1) DEFAULT 0 COMMENT 'Marked as permanently failed after X attempts',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_failure_patterns_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE SET NULL,
  KEY idx_failure_patterns_domain (callback_domain),
  KEY idx_failure_patterns_publisher (publisher_id),
  KEY idx_failure_patterns_permanent (is_permanent_failure)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
