-- Migration: Add password_hash column to publishers table
-- Date: 2024
-- This migration adds the password_hash column for publisher authentication

ALTER TABLE publishers 
ADD COLUMN password_hash VARCHAR(255) NULL AFTER email;

-- Note: Existing publishers will have NULL password_hash
-- You may want to set default passwords or require password reset for existing users


