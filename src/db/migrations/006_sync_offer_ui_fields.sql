-- Migration: Sync Offer UI Fields with Database Schema
-- Purpose: Add missing UI fields and convert ENUMs to VARCHAR for better flexibility
-- Date: 2024
-- 
-- This migration:
-- 1. Converts existing ENUM columns to VARCHAR (status, capping_type)
-- 2. Adds missing UI fields for offer visibility, targeting actions, and advanced capping
-- 3. Ensures 100% field coverage for the React Offer Creation UI
-- 4. Maintains backward compatibility with existing data

-- Step 1: Convert ENUM columns to VARCHAR (backward compatible)
-- Converting status ENUM to VARCHAR
ALTER TABLE offers 
  MODIFY COLUMN status VARCHAR(20) DEFAULT 'draft' 
  COMMENT 'Offer status: live, paused, or draft';

-- Converting capping_type ENUM to VARCHAR
ALTER TABLE offers 
  MODIFY COLUMN capping_type VARCHAR(20) DEFAULT 'none' 
  COMMENT 'Capping type: none, daily, weekly, or monthly';

-- Step 2: Add offer visibility field
-- Controls who can see/access the offer (e.g., 'public', 'private', 'restricted')
ALTER TABLE offers 
  ADD COLUMN offer_visibility VARCHAR(50) NULL DEFAULT NULL 
  COMMENT 'Offer visibility setting: public, private, restricted, etc.'
  AFTER status;

-- Step 3: Add targeting action fields
-- These fields control the action (ALLOW/BLOCK) for each targeting type
ALTER TABLE offers 
  ADD COLUMN browser_action VARCHAR(20) NULL DEFAULT NULL 
  COMMENT 'Browser targeting action: ALLOW or BLOCK'
  AFTER browser_targeting_json;

ALTER TABLE offers 
  ADD COLUMN device_action VARCHAR(20) NULL DEFAULT NULL 
  COMMENT 'Device targeting action: ALLOW or BLOCK'
  AFTER device_targeting_json;

ALTER TABLE offers 
  ADD COLUMN os_action VARCHAR(20) NULL DEFAULT NULL 
  COMMENT 'OS targeting action: ALLOW or BLOCK'
  AFTER os_targeting_json;

-- Step 4: Add advertiser-level capping fields
-- Budget capping at advertiser level (separate from offer-level budget_cap)
ALTER TABLE offers 
  ADD COLUMN advertiser_capping_budget_duration VARCHAR(20) NULL DEFAULT NULL 
  COMMENT 'Advertiser budget capping duration: daily, weekly, or monthly'
  AFTER budget_cap;

ALTER TABLE offers 
  ADD COLUMN advertiser_capping_budget_amount DECIMAL(10,2) NULL DEFAULT NULL 
  COMMENT 'Advertiser budget capping amount'
  AFTER advertiser_capping_budget_duration;

-- Step 5: Add conversion capping duration field
-- Duration for conversion capping (complements existing conversion_cap)
ALTER TABLE offers 
  ADD COLUMN capping_conversions_duration VARCHAR(20) NULL DEFAULT NULL 
  COMMENT 'Conversion capping duration: daily, weekly, or monthly'
  AFTER conversion_cap;

-- Step 6: Add over-capping behavior fields
-- Controls what happens when advertiser/affiliate caps are exceeded
ALTER TABLE offers 
  ADD COLUMN advertiser_over_capping VARCHAR(50) NULL DEFAULT NULL 
  COMMENT 'Advertiser over-capping action: pause, fallback, reject, etc.'
  AFTER advertiser_capping_budget_amount;

ALTER TABLE offers 
  ADD COLUMN affiliate_over_capping VARCHAR(50) NULL DEFAULT NULL 
  COMMENT 'Affiliate over-capping action: pause, fallback, reject, etc.'
  AFTER advertiser_over_capping;

-- Note: macros_json already exists in the schema (line 67), so no need to add it

-- Add indexes for commonly queried new fields (optional but recommended for performance)
CREATE INDEX idx_offers_visibility ON offers(offer_visibility);
CREATE INDEX idx_offers_advertiser_capping ON offers(advertiser_capping_budget_duration, advertiser_capping_budget_amount);

