-- Smartlink Engine Migration
-- Creates tables for smartlink configuration, scoring, and performance tracking

-- 1. Smartlinks (AI/Rule-based offer selection)
CREATE TABLE IF NOT EXISTS smartlinks (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  publisher_id INT NULL COMMENT 'NULL for global smartlink',
  description TEXT,
  scoring_algorithm ENUM('epc', 'cr', 'revenue', 'hybrid') DEFAULT 'hybrid',
  min_epc DECIMAL(10,4) DEFAULT 0.0000 COMMENT 'Minimum EPC threshold',
  min_cr DECIMAL(5,2) DEFAULT 0.00 COMMENT 'Minimum conversion rate threshold',
  fallback_offer_id INT NULL COMMENT 'Default fallback if no offers match',
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_smartlinks_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE CASCADE,
  CONSTRAINT fk_smartlinks_fallback FOREIGN KEY (fallback_offer_id) REFERENCES offers(id) ON DELETE SET NULL,
  KEY idx_smartlinks_publisher (publisher_id),
  KEY idx_smartlinks_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Smartlink Offers (offers included in smartlink)
CREATE TABLE IF NOT EXISTS smartlink_offers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  smartlink_id INT NOT NULL,
  offer_id INT NOT NULL,
  weight INT DEFAULT 100 COMMENT 'Weight for scoring',
  priority INT DEFAULT 1 COMMENT 'Lower = higher priority',
  geo_restrictions JSON,
  device_restrictions JSON,
  min_score DECIMAL(10,4) DEFAULT 0.0000 COMMENT 'Minimum score to be selected',
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_smartlink_offers_smartlink FOREIGN KEY (smartlink_id) REFERENCES smartlinks(id) ON DELETE CASCADE,
  CONSTRAINT fk_smartlink_offers_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
  KEY idx_smartlink_offers_smartlink (smartlink_id),
  KEY idx_smartlink_offers_offer (offer_id),
  UNIQUE KEY uniq_smartlink_offer (smartlink_id, offer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Smartlink Performance Scores (real-time scoring)
CREATE TABLE IF NOT EXISTS smartlink_scores (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  smartlink_id INT NOT NULL,
  offer_id INT NOT NULL,
  publisher_id INT NULL COMMENT 'NULL for global scores',
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  clicks INT DEFAULT 0,
  conversions INT DEFAULT 0,
  revenue DECIMAL(10,2) DEFAULT 0.00,
  payout DECIMAL(10,2) DEFAULT 0.00,
  epc DECIMAL(10,4) DEFAULT 0.0000,
  cr DECIMAL(5,2) DEFAULT 0.00,
  score DECIMAL(10,4) DEFAULT 0.0000 COMMENT 'Calculated smartlink score',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_smartlink_scores_smartlink FOREIGN KEY (smartlink_id) REFERENCES smartlinks(id) ON DELETE CASCADE,
  CONSTRAINT fk_smartlink_scores_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
  CONSTRAINT fk_smartlink_scores_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE SET NULL,
  KEY idx_smartlink_scores_smartlink (smartlink_id),
  KEY idx_smartlink_scores_offer (offer_id),
  KEY idx_smartlink_scores_publisher (publisher_id),
  KEY idx_smartlink_scores_period (period_start, period_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Smartlink Selection Logs
CREATE TABLE IF NOT EXISTS smartlink_selection_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  click_id BIGINT NULL,
  smartlink_id INT NOT NULL,
  selected_offer_id INT NOT NULL,
  publisher_id INT NOT NULL,
  selection_score DECIMAL(10,4),
  candidate_offers JSON COMMENT 'All offers considered',
  selection_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_smartlink_selection_logs_click FOREIGN KEY (click_id) REFERENCES clicks(id) ON DELETE SET NULL,
  CONSTRAINT fk_smartlink_selection_logs_smartlink FOREIGN KEY (smartlink_id) REFERENCES smartlinks(id) ON DELETE CASCADE,
  CONSTRAINT fk_smartlink_selection_logs_offer FOREIGN KEY (selected_offer_id) REFERENCES offers(id) ON DELETE CASCADE,
  CONSTRAINT fk_smartlink_selection_logs_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE CASCADE,
  KEY idx_smartlink_selection_smartlink (smartlink_id),
  KEY idx_smartlink_selection_offer (selected_offer_id),
  KEY idx_smartlink_selection_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
