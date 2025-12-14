-- Real-Time Dashboard System Migration
-- Creates tables for caching real-time stats and performance metrics

-- Note: This system uses Redis for real-time caching, but we also store aggregated stats in MySQL
-- for historical analysis and fallback when Redis is unavailable

-- 1. Real-Time Stats Cache (MySQL fallback/backup)
CREATE TABLE IF NOT EXISTS realtime_stats_cache (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  stat_type ENUM('offer', 'publisher', 'advertiser', 'global') NOT NULL,
  entity_id INT NULL COMMENT 'offer_id, publisher_id, or advertiser_id',
  time_window ENUM('1min', '5min', '15min', '1hour', '1day') NOT NULL,
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  clicks INT DEFAULT 0,
  impressions INT DEFAULT 0,
  conversions INT DEFAULT 0,
  revenue DECIMAL(10,2) DEFAULT 0.00,
  payout DECIMAL(10,2) DEFAULT 0.00,
  profit DECIMAL(10,2) DEFAULT 0.00,
  epc DECIMAL(10,4) DEFAULT 0.0000 COMMENT 'Earnings Per Click',
  ctr DECIMAL(5,2) DEFAULT 0.00 COMMENT 'Click-Through Rate',
  cr DECIMAL(5,2) DEFAULT 0.00 COMMENT 'Conversion Rate',
  stats_json JSON COMMENT 'Additional metrics',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_realtime_type (stat_type, entity_id),
  KEY idx_realtime_window (time_window, period_start),
  KEY idx_realtime_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Performance Heatmaps (for visualization)
CREATE TABLE IF NOT EXISTS performance_heatmaps (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  offer_id INT NULL,
  publisher_id INT NULL,
  dimension VARCHAR(50) NOT NULL COMMENT 'country, device, hour, day_of_week',
  dimension_value VARCHAR(100) NOT NULL,
  clicks INT DEFAULT 0,
  conversions INT DEFAULT 0,
  revenue DECIMAL(10,2) DEFAULT 0.00,
  period_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_heatmaps_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
  CONSTRAINT fk_heatmaps_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE CASCADE,
  KEY idx_heatmaps_offer (offer_id),
  KEY idx_heatmaps_publisher (publisher_id),
  KEY idx_heatmaps_dimension (dimension, dimension_value),
  KEY idx_heatmaps_period (period_date),
  UNIQUE KEY uniq_heatmap (offer_id, publisher_id, dimension, dimension_value, period_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
