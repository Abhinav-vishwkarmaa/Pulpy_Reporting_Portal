-- Advanced Fallback Routing Engine Migration
-- Creates tables for multi-tier fallback chains, geo-based fallback, and weighted distribution

-- 1. Fallback Chains (multi-tier fallback configuration)
CREATE TABLE IF NOT EXISTS fallback_chains (
  id INT AUTO_INCREMENT PRIMARY KEY,
  offer_id INT NOT NULL,
  chain_name VARCHAR(255),
  priority INT DEFAULT 1 COMMENT 'Lower number = higher priority',
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_fallback_chains_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
  KEY idx_fallback_chains_offer (offer_id),
  KEY idx_fallback_chains_priority (priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Fallback Chain Items (individual offers in a chain)
CREATE TABLE IF NOT EXISTS fallback_chain_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  chain_id INT NOT NULL,
  offer_id INT NOT NULL COMMENT 'Fallback offer',
  position INT NOT NULL COMMENT 'Order in chain (1, 2, 3, ...)',
  weight INT DEFAULT 100 COMMENT 'For weighted distribution (percentage)',
  geo_restrictions JSON COMMENT 'Geo-based fallback rules',
  publisher_restrictions JSON COMMENT 'Publisher-specific fallback rules',
  conditions JSON COMMENT 'Additional conditions (device, time, etc.)',
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_fallback_items_chain FOREIGN KEY (chain_id) REFERENCES fallback_chains(id) ON DELETE CASCADE,
  CONSTRAINT fk_fallback_items_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
  KEY idx_fallback_items_chain (chain_id),
  KEY idx_fallback_items_position (position),
  UNIQUE KEY uniq_chain_position (chain_id, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Fallback Execution Logs
CREATE TABLE IF NOT EXISTS fallback_execution_logs (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  click_id BIGINT NULL,
  original_offer_id INT NOT NULL,
  fallback_chain_id INT NULL,
  selected_offer_id INT NOT NULL COMMENT 'Offer that was selected',
  selection_reason VARCHAR(255) COMMENT 'Why this offer was selected',
  execution_path JSON COMMENT 'Full path through fallback chain',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_fallback_logs_click FOREIGN KEY (click_id) REFERENCES clicks(id) ON DELETE SET NULL,
  CONSTRAINT fk_fallback_logs_original FOREIGN KEY (original_offer_id) REFERENCES offers(id) ON DELETE CASCADE,
  CONSTRAINT fk_fallback_logs_selected FOREIGN KEY (selected_offer_id) REFERENCES offers(id) ON DELETE CASCADE,
  KEY idx_fallback_logs_original (original_offer_id),
  KEY idx_fallback_logs_selected (selected_offer_id),
  KEY idx_fallback_logs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
