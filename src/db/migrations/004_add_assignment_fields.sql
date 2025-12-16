-- Migration: Add new fields to publisher_offers table for multi-publisher assignment support
-- Date: 2024

ALTER TABLE publisher_offers 
ADD COLUMN conversion_approval_percentage DECIMAL(5,2) NULL DEFAULT NULL,
ADD COLUMN capping_budget_duration VARCHAR(20) NULL DEFAULT NULL,
ADD COLUMN capping_budget_amount DECIMAL(10,2) NULL DEFAULT NULL,
ADD COLUMN capping_conversions_duration VARCHAR(20) NULL DEFAULT NULL,
ADD COLUMN capping_conversions_amount INT NULL DEFAULT NULL,
ADD COLUMN callback_url TEXT NULL DEFAULT NULL,
ADD COLUMN offer_url TEXT NULL DEFAULT NULL;

-- Add index for better query performance
ALTER TABLE publisher_offers 
ADD KEY idx_po_capping_budget (capping_budget_duration, capping_budget_amount),
ADD KEY idx_po_capping_conversions (capping_conversions_duration, capping_conversions_amount);


