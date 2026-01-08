-- Optimization for finding latest click efficiently
-- This index supports: SELECT ... WHERE offer_id=? AND publisher_id=? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_clicks_offer_pub_created ON clicks (offer_id, publisher_id, created_at);
