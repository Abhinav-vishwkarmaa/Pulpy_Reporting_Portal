-- Optimize indices for high-concurrency tracking
-- These indices enable covering index scans for capping checks and daily stats updates

-- Index for counting conversions by valid date ranges (replaces DATE() function scans)
CREATE INDEX IF NOT EXISTS idx_conversions_offer_date ON conversions (offer_id, created_at);

-- Index for checking unique clicks efficiently
CREATE INDEX IF NOT EXISTS idx_clicks_offer_pub_ip ON clicks (offer_id, publisher_id, ip, created_at);
