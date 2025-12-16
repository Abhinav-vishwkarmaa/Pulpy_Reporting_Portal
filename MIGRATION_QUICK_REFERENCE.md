# Migration Quick Reference

## Summary
This migration adds 9 missing fields to the `offers` table and converts 2 ENUM columns to VARCHAR to fully support the React Offer Creation UI.

## Missing Fields Identified

| # | Field Name | Type | Purpose |
|---|------------|------|---------|
| 1 | `offer_visibility` | VARCHAR(50) | Controls offer visibility/accessibility |
| 2 | `browser_action` | VARCHAR(20) | Browser targeting action (ALLOW/BLOCK) |
| 3 | `device_action` | VARCHAR(20) | Device targeting action (ALLOW/BLOCK) |
| 4 | `os_action` | VARCHAR(20) | OS targeting action (ALLOW/BLOCK) |
| 5 | `advertiser_capping_budget_duration` | VARCHAR(20) | Advertiser budget capping duration |
| 6 | `advertiser_capping_budget_amount` | DECIMAL(10,2) | Advertiser budget capping amount |
| 7 | `capping_conversions_duration` | VARCHAR(20) | Conversion capping duration |
| 8 | `advertiser_over_capping` | VARCHAR(50) | Action when advertiser cap exceeded |
| 9 | `affiliate_over_capping` | VARCHAR(50) | Action when affiliate cap exceeded |

**Note**: `macros_json` already exists in the schema.

## ENUM to VARCHAR Conversions

| Column | Old Type | New Type | Reason |
|--------|----------|----------|--------|
| `status` | ENUM('live','paused','draft') | VARCHAR(20) | Remove ENUM constraint |
| `capping_type` | ENUM('none','daily','monthly','weekly') | VARCHAR(20) | Remove ENUM constraint |

## Production-Safe ALTER TABLE Statements

```sql
-- Step 1: Convert ENUMs to VARCHAR
ALTER TABLE offers 
  MODIFY COLUMN status VARCHAR(20) DEFAULT 'draft' 
  COMMENT 'Offer status: live, paused, or draft';

ALTER TABLE offers 
  MODIFY COLUMN capping_type VARCHAR(20) DEFAULT 'none' 
  COMMENT 'Capping type: none, daily, weekly, or monthly';

-- Step 2: Add offer visibility
ALTER TABLE offers 
  ADD COLUMN offer_visibility VARCHAR(50) NULL DEFAULT NULL 
  COMMENT 'Offer visibility setting: public, private, restricted, etc.'
  AFTER status;

-- Step 3: Add targeting action fields
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
ALTER TABLE offers 
  ADD COLUMN advertiser_capping_budget_duration VARCHAR(20) NULL DEFAULT NULL 
  COMMENT 'Advertiser budget capping duration: daily, weekly, or monthly'
  AFTER budget_cap;

ALTER TABLE offers 
  ADD COLUMN advertiser_capping_budget_amount DECIMAL(10,2) NULL DEFAULT NULL 
  COMMENT 'Advertiser budget capping amount'
  AFTER advertiser_capping_budget_duration;

-- Step 5: Add conversion capping duration
ALTER TABLE offers 
  ADD COLUMN capping_conversions_duration VARCHAR(20) NULL DEFAULT NULL 
  COMMENT 'Conversion capping duration: daily, weekly, or monthly'
  AFTER conversion_cap;

-- Step 6: Add over-capping behavior fields
ALTER TABLE offers 
  ADD COLUMN advertiser_over_capping VARCHAR(50) NULL DEFAULT NULL 
  COMMENT 'Advertiser over-capping action: pause, fallback, reject, etc.'
  AFTER advertiser_capping_budget_amount;

ALTER TABLE offers 
  ADD COLUMN affiliate_over_capping VARCHAR(50) NULL DEFAULT NULL 
  COMMENT 'Affiliate over-capping action: pause, fallback, reject, etc.'
  AFTER advertiser_over_capping;

-- Step 7: Add performance indexes (optional)
CREATE INDEX idx_offers_visibility ON offers(offer_visibility);
CREATE INDEX idx_offers_advertiser_capping ON offers(advertiser_capping_budget_duration, advertiser_capping_budget_amount);
```

## Field Mapping to UI

| Database Field | UI Component Type | Expected Values |
|---------------|-------------------|-----------------|
| `offer_visibility` | Dropdown | `public`, `private`, `restricted` |
| `browser_action` | Radio/Select | `ALLOW`, `BLOCK` |
| `device_action` | Radio/Select | `ALLOW`, `BLOCK` |
| `os_action` | Radio/Select | `ALLOW`, `BLOCK` |
| `advertiser_capping_budget_duration` | Dropdown | `daily`, `weekly`, `monthly` |
| `advertiser_capping_budget_amount` | Number Input | Decimal value |
| `capping_conversions_duration` | Dropdown | `daily`, `weekly`, `monthly` |
| `advertiser_over_capping` | Dropdown | `pause`, `fallback`, `reject` |
| `affiliate_over_capping` | Dropdown | `pause`, `fallback`, `reject` |

## Execution

Run the complete migration file:
```bash
mysql -u [user] -p [database] < src/db/migrations/006_sync_offer_ui_fields.sql
```

Or execute statements individually in your MySQL client.

## Verification

After migration, verify the changes:
```sql
-- Check new columns exist
DESCRIBE offers;

-- Verify ENUMs are converted
SHOW COLUMNS FROM offers WHERE Field IN ('status', 'capping_type');

-- Check indexes
SHOW INDEXES FROM offers WHERE Key_name LIKE 'idx_offers%';
```

## Backward Compatibility

✅ All new columns are nullable (NULL DEFAULT)  
✅ ENUM to VARCHAR conversion preserves existing data  
✅ No breaking changes to existing queries  
✅ Existing records remain valid  

## Success Criteria

✅ Database schema fully supports the Offer Creation UI  
✅ No ENUM usage (all converted to VARCHAR)  
✅ No UI or backend logic changes needed (fields are nullable)  
✅ Existing records remain valid  
✅ Production-ready solution  

