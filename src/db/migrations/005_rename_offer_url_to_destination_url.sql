-- Migration: Rename offer_url to destination_url and add updated_at
-- Date: 2025-01-15
-- Purpose: Industry-standard naming and tracking URL fix

-- Rename offer_url column to destination_url (if it exists)
-- Note: This will fail if column doesn't exist, which is fine - means it's already renamed
ALTER TABLE publisher_offers 
CHANGE COLUMN offer_url destination_url TEXT NULL DEFAULT NULL;

-- Add updated_at timestamp column (if it doesn't exist)
-- Note: This will fail if column already exists, which is fine
ALTER TABLE publisher_offers 
ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Unique constraint should already exist from initial schema
-- If it doesn't exist, uncomment the following line:
-- ALTER TABLE publisher_offers ADD UNIQUE KEY uniq_publisher_offer (publisher_id, offer_id);

