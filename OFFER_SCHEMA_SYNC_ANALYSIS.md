# Offer Schema Synchronization Analysis

## Overview
This document provides a comprehensive analysis of the database schema synchronization to support 100% field coverage for the React Offer Creation UI.

## Current Database Schema Analysis

### Existing Fields in `offers` Table
The current schema already includes:
- ✅ `macros_json` (JSON) - Token mappings
- ✅ `browser_targeting_json` (JSON) - Browser targeting rules
- ✅ `os_targeting_json` (JSON) - OS targeting rules
- ✅ `device_targeting_json` (JSON) - Device targeting rules
- ✅ `capping_type` (ENUM) - Basic capping type
- ✅ `budget_cap` (DECIMAL) - Budget cap amount
- ✅ `conversion_cap` (INT) - Conversion cap amount

### Issues Identified
1. **ENUM Usage**: Two columns use ENUMs (`status`, `capping_type`) which need to be converted to VARCHAR
2. **Missing Action Fields**: Targeting JSON fields exist but lack corresponding action fields (ALLOW/BLOCK)
3. **Missing Visibility Control**: No field for offer visibility settings
4. **Incomplete Capping Logic**: Missing advertiser-level capping and over-capping behavior fields
5. **Missing Duration Fields**: Conversion capping lacks duration specification

---

## Missing Fields Analysis

### 1. `offer_visibility`
**Status**: ❌ Missing  
**Type**: VARCHAR(50)  
**Purpose**: Controls who can see/access the offer  
**UI Mapping**: Visibility dropdown/selector in Offer Creation form  
**Values**: `public`, `private`, `restricted`, etc.  
**Justification**: Essential for controlling offer accessibility and distribution

### 2. `browser_action`
**Status**: ❌ Missing  
**Type**: VARCHAR(20)  
**Purpose**: Defines the action for browser targeting (ALLOW or BLOCK)  
**UI Mapping**: Action selector next to browser targeting configuration  
**Values**: `ALLOW`, `BLOCK`  
**Justification**: `browser_targeting_json` exists but lacks the action control. This field determines whether the targeting list is an allowlist or blocklist.

### 3. `device_action`
**Status**: ❌ Missing  
**Type**: VARCHAR(20)  
**Purpose**: Defines the action for device targeting (ALLOW or BLOCK)  
**UI Mapping**: Action selector next to device targeting configuration  
**Values**: `ALLOW`, `BLOCK`  
**Justification**: `device_targeting_json` exists but lacks the action control. This field determines whether the targeting list is an allowlist or blocklist.

### 4. `os_action`
**Status**: ❌ Missing  
**Type**: VARCHAR(20)  
**Purpose**: Defines the action for OS targeting (ALLOW or BLOCK)  
**UI Mapping**: Action selector next to OS targeting configuration  
**Values**: `ALLOW`, `BLOCK`  
**Justification**: `os_targeting_json` exists but lacks the action control. This field determines whether the targeting list is an allowlist or blocklist.

### 5. `advertiser_capping_budget_duration`
**Status**: ❌ Missing  
**Type**: VARCHAR(20)  
**Purpose**: Duration period for advertiser-level budget capping  
**UI Mapping**: Duration selector in advertiser capping section (daily/weekly/monthly)  
**Values**: `daily`, `weekly`, `monthly`  
**Justification**: Supports advertiser-level budget capping separate from offer-level capping. Complements `advertiser_capping_budget_amount`.

### 6. `advertiser_capping_budget_amount`
**Status**: ❌ Missing  
**Type**: DECIMAL(10,2)  
**Purpose**: Budget amount limit for advertiser-level capping  
**UI Mapping**: Budget amount input in advertiser capping section  
**Justification**: Allows setting budget limits at the advertiser level, independent of offer-level `budget_cap`.

### 7. `capping_conversions_duration`
**Status**: ❌ Missing  
**Type**: VARCHAR(20)  
**Purpose**: Duration period for conversion capping  
**UI Mapping**: Duration selector for conversion capping (daily/weekly/monthly)  
**Values**: `daily`, `weekly`, `monthly`  
**Justification**: `conversion_cap` exists but lacks duration specification. This field defines the time window for conversion capping.

### 8. `advertiser_over_capping`
**Status**: ❌ Missing  
**Type**: VARCHAR(50)  
**Purpose**: Action to take when advertiser cap is exceeded  
**UI Mapping**: Action selector in advertiser capping section  
**Values**: `pause`, `fallback`, `reject`, etc.  
**Justification**: Defines behavior when advertiser-level caps are exceeded, similar to offer-level `cap_action`.

### 9. `affiliate_over_capping`
**Status**: ❌ Missing  
**Type**: VARCHAR(50)  
**Purpose**: Action to take when affiliate cap is exceeded  
**UI Mapping**: Action selector in affiliate capping section  
**Values**: `pause`, `fallback`, `reject`, etc.  
**Justification**: Defines behavior when affiliate-level caps are exceeded, providing granular control over publisher-specific capping.

### 10. `macros_json`
**Status**: ✅ Already Exists  
**Type**: JSON  
**Purpose**: Token mappings for offer URLs  
**Justification**: No changes needed - field already exists and supports UI requirements.

---

## Schema Changes Summary

### ENUM to VARCHAR Conversions
1. **`status`**: `ENUM('live','paused','draft')` → `VARCHAR(20)`
   - **Reason**: Eliminates ENUM constraint while maintaining backward compatibility
   - **Impact**: Existing data remains valid (VARCHAR can store all ENUM values)

2. **`capping_type`**: `ENUM('none','daily','monthly','weekly')` → `VARCHAR(20)`
   - **Reason**: Eliminates ENUM constraint while maintaining backward compatibility
   - **Impact**: Existing data remains valid (VARCHAR can store all ENUM values)

### New Columns Added
1. `offer_visibility` - VARCHAR(50) NULL
2. `browser_action` - VARCHAR(20) NULL
3. `device_action` - VARCHAR(20) NULL
4. `os_action` - VARCHAR(20) NULL
5. `advertiser_capping_budget_duration` - VARCHAR(20) NULL
6. `advertiser_capping_budget_amount` - DECIMAL(10,2) NULL
7. `capping_conversions_duration` - VARCHAR(20) NULL
8. `advertiser_over_capping` - VARCHAR(50) NULL
9. `affiliate_over_capping` - VARCHAR(50) NULL

---

## Field Mapping to UI Components

| Database Field | UI Component | UI Location | Data Type |
|---------------|--------------|-------------|-----------|
| `offer_visibility` | Dropdown/Select | Offer Settings Section | String |
| `browser_action` | Radio/Select | Browser Targeting Section | String (ALLOW/BLOCK) |
| `device_action` | Radio/Select | Device Targeting Section | String (ALLOW/BLOCK) |
| `os_action` | Radio/Select | OS Targeting Section | String (ALLOW/BLOCK) |
| `advertiser_capping_budget_duration` | Dropdown | Advertiser Capping Section | String (daily/weekly/monthly) |
| `advertiser_capping_budget_amount` | Number Input | Advertiser Capping Section | Decimal |
| `capping_conversions_duration` | Dropdown | Conversion Capping Section | String (daily/weekly/monthly) |
| `advertiser_over_capping` | Dropdown | Advertiser Capping Section | String |
| `affiliate_over_capping` | Dropdown | Affiliate Capping Section | String |
| `macros_json` | JSON Editor/Key-Value Pairs | Macros/Tokens Section | JSON Object |

---

## Production-Safe Migration Strategy

### Backward Compatibility
- ✅ All new columns are nullable (NULL DEFAULT)
- ✅ ENUM to VARCHAR conversion preserves existing data
- ✅ No data loss or breaking changes
- ✅ Existing queries continue to work

### Migration Safety
- ✅ Uses `ALTER TABLE` (additive changes only)
- ✅ No table drops or data deletion
- ✅ Indexes added for performance (non-blocking)
- ✅ Can be rolled back if needed

### Testing Recommendations
1. Test migration on staging environment first
2. Verify existing offers remain accessible
3. Test UI form submission with new fields
4. Verify backward compatibility with existing API calls
5. Check that NULL values are handled correctly in application code

---

## SQL Migration File

The complete migration is available in:
**`src/db/migrations/006_sync_offer_ui_fields.sql`**

### Execution Order
1. Convert ENUMs to VARCHAR (preserves data)
2. Add new columns (all nullable)
3. Add indexes (optional, for performance)

### Rollback Plan
If rollback is needed:
```sql
-- Remove new columns
ALTER TABLE offers DROP COLUMN affiliate_over_capping;
ALTER TABLE offers DROP COLUMN advertiser_over_capping;
ALTER TABLE offers DROP COLUMN capping_conversions_duration;
ALTER TABLE offers DROP COLUMN advertiser_capping_budget_amount;
ALTER TABLE offers DROP COLUMN advertiser_capping_budget_duration;
ALTER TABLE offers DROP COLUMN os_action;
ALTER TABLE offers DROP COLUMN device_action;
ALTER TABLE offers DROP COLUMN browser_action;
ALTER TABLE offers DROP COLUMN offer_visibility;

-- Revert ENUMs (if needed)
ALTER TABLE offers MODIFY COLUMN status ENUM('live','paused','draft') DEFAULT 'draft';
ALTER TABLE offers MODIFY COLUMN capping_type ENUM('none','daily','monthly','weekly') DEFAULT 'none';

-- Drop indexes
DROP INDEX idx_offers_visibility ON offers;
DROP INDEX idx_offers_advertiser_capping ON offers;
```

---

## Success Criteria Verification

✅ **Database schema fully supports the Offer Creation UI**
- All 10 required fields are present or added

✅ **No ENUM usage**
- All ENUMs converted to VARCHAR
- New fields use VARCHAR, INT, DECIMAL, JSON, or TINYINT only

✅ **No UI or backend logic changes needed**
- All fields are nullable, so existing code continues to work
- New fields can be added to forms incrementally

✅ **Existing records remain valid**
- All existing data preserved
- NULL values for new fields are acceptable

✅ **Production-ready solution**
- Safe ALTER TABLE statements
- Backward compatible
- Includes indexes for performance

---

## Next Steps

1. **Review Migration**: Review `006_sync_offer_ui_fields.sql` for accuracy
2. **Test Migration**: Run on staging environment
3. **Update Backend**: Add new fields to offer service/controller (optional, for immediate support)
4. **Update Schema Validation**: Add new fields to `offer.schema.js` (optional)
5. **Update UI**: Add form fields for new columns in React UI
6. **Deploy**: Execute migration in production

---

## Notes

- All new fields are nullable to ensure backward compatibility
- The migration is idempotent-safe (can be run multiple times with IF NOT EXISTS logic if needed)
- Indexes are added for commonly queried fields but can be removed if not needed
- VARCHAR sizes are generous to accommodate future values
- DECIMAL(10,2) matches existing budget_cap field for consistency

