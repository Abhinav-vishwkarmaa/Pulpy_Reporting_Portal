-- Migration: Enforce one click can only give one conversion
-- Purpose: Add unique constraint on click_uuid to prevent duplicate conversions from same click
-- Date: 2025-12-16
-- Description: Changes click_uuid index to unique constraint to ensure one click = one conversion

-- Drop existing index and add unique constraint
-- Note: This allows NULL values (for conversions not from clicks) but ensures each click_uuid appears only once
ALTER TABLE conversions
DROP INDEX idx_conversions_click_uuid,
ADD UNIQUE KEY uniq_click_uuid (click_uuid);