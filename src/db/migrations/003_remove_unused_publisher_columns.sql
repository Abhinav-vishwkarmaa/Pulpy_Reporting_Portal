-- Migration: Remove unused columns from publishers table
-- Date: 2024
-- This migration removes columns that are no longer used after publisher refactoring
-- Run this AFTER 002_add_publisher_password.sql

-- Note: MySQL doesn't support IF EXISTS for DROP COLUMN
-- If a column doesn't exist, the statement will fail
-- You can safely ignore errors for columns that don't exist

-- Remove unused columns
ALTER TABLE publishers DROP COLUMN mobile;
ALTER TABLE publishers DROP COLUMN last_name;
ALTER TABLE publishers DROP COLUMN position;
ALTER TABLE publishers DROP COLUMN address;
ALTER TABLE publishers DROP COLUMN state;
ALTER TABLE publishers DROP COLUMN zip_code;
ALTER TABLE publishers DROP COLUMN tax_invoice_details;
ALTER TABLE publishers DROP COLUMN payment_terms;

-- If you get errors about columns not existing, that's fine - they may have already been removed
