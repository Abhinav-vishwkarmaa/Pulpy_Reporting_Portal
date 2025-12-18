# Database Migration: Conversion Capping & Race Condition Fixes

## Overview

This migration implements atomic conversion cap enforcement and support for multiple conversions per click in the Pulpy Reporting Portal. It addresses critical race conditions that could cause financial discrepancies and overspending in high-concurrency scenarios.

## Migration Files

### Primary Migration
- **File**: `src/db/migrations/007_conversion_capping_race_condition_fixes.sql`
- **Purpose**: Implements all new features and data structures
- **Safety**: Idempotent, backward-compatible, can be run multiple times

### Rollback Migration
- **File**: `src/db/migrations/007_rollback_conversion_capping_race_condition_fixes.sql`
- **Purpose**: Safely removes all changes if needed
- **Warning**: Will disable conversion cap enforcement features

### Syntax Test
- **File**: `test_migration_syntax.sql`
- **Purpose**: Validates SQL syntax without affecting production data

## Schema Changes

### Offers Table Enhancements

```sql
ALTER TABLE offers
ADD COLUMN conversion_cap INT NULL,
ADD COLUMN conversion_cap_duration ENUM('lifetime','daily','weekly','monthly') DEFAULT 'lifetime',
ADD COLUMN max_conversions_per_click INT DEFAULT 1,
ADD COLUMN conversion_window_hours INT DEFAULT 24;
```

**New Fields**:
- `conversion_cap`: Maximum conversions allowed (NULL = unlimited)
- `conversion_cap_duration`: Time scope for cap enforcement
- `max_conversions_per_click`: Per-click conversion limit
- `conversion_window_hours`: Attribution window for conversions

### Conversions Table Hardening

```sql
ALTER TABLE conversions
ADD UNIQUE KEY uniq_offer_rcid (offer_id, rcid),
ADD COLUMN conversion_sequence INT DEFAULT 1,
ADD COLUMN rejection_reason VARCHAR(50) NULL;
```

**New Fields**:
- `conversion_sequence`: Order number for multiple conversions per click
- `rejection_reason`: Why conversion was rejected (CAP_REACHED, WINDOW_EXPIRED, etc.)

**New Constraint**:
- `uniq_offer_rcid`: Prevents duplicate conversions per offer

### New Counter Table

```sql
CREATE TABLE offer_conversion_counters (
  offer_id INT NOT NULL PRIMARY KEY,
  lifetime_conversions INT DEFAULT 0,
  daily_conversions INT DEFAULT 0,
  weekly_conversions INT DEFAULT 0,
  monthly_conversions INT DEFAULT 0,
  last_daily_reset DATE DEFAULT (CURRENT_DATE),
  -- ... reset tracking fields
);
```

**Purpose**: Atomic counters for race-condition-free cap enforcement

### Click Tracking Enhancement

```sql
ALTER TABLE clicks
ADD COLUMN total_conversions INT DEFAULT 0;
```

**Purpose**: Track total conversions per click for limit enforcement

## Performance Impact

### New Indexes
```sql
CREATE INDEX idx_conversions_sequence ON conversions(click_uuid, conversion_sequence);
CREATE INDEX idx_conversions_rejection ON conversions(rejection_reason, created_at);
CREATE INDEX idx_offers_cap_settings ON offers(conversion_cap, conversion_cap_duration, max_conversions_per_click);
CREATE INDEX idx_conversions_offer_status ON conversions(offer_id, status, created_at);
CREATE INDEX idx_clicks_offer_total_conversions ON clicks(offer_id, total_conversions);
```

### Storage Overhead
- **Per Offer**: ~50 bytes for counter row
- **Per Conversion**: ~10 bytes for sequence and rejection fields
- **Per Click**: 4 bytes for total_conversions counter

### Query Performance
- **Cap Checks**: O(1) with Redis, O(1) with counters table
- **Sequence Assignment**: O(1) with proper indexing
- **Reporting**: Improved with new status and rejection indexes

## Data Migration

### Initialization Process
1. **Counter Creation**: Creates counter rows for all existing offers
2. **Data Population**: Calculates current conversion counts for each time period
3. **Click Updates**: Populates total_conversions for existing clicks
4. **Validation**: Ensures data integrity after migration

### Safe Initialization
```sql
-- Only creates counters for offers that don't have them
INSERT INTO offer_conversion_counters (offer_id)
SELECT id FROM offers
WHERE id NOT IN (SELECT offer_id FROM offer_conversion_counters);
```

## Business Logic Changes

### Cap Enforcement Rules

#### 1. Offer-Level Caps
- **Scope**: Applies to entire offer, not individual clicks
- **Duration Options**: lifetime, daily, weekly, monthly
- **Atomic Enforcement**: Prevents overshooting under concurrency
- **Action Types**: pause_offer, reject_conversion, redirect_fallback, alert_only

#### 2. Per-Click Limits
- **Configurable**: `max_conversions_per_click` (NULL = unlimited)
- **Sequence Tracking**: Each conversion numbered per click
- **Rejection**: Clean error messages for limit violations

#### 3. Attribution Windows
- **Time-Based**: Conversions rejected after `conversion_window_hours`
- **Default**: 24 hours
- **Purpose**: Prevents stale conversions from affecting caps

### Conversion Processing Flow

```
1. Validate attribution window
2. Check per-click conversion limit
3. Atomic cap check and increment
4. Deduplication check
5. Insert conversion with sequence
6. Update click counter
7. Async postback delivery
8. Buffer stats update
```

## Deployment Instructions

### Pre-Deployment Checklist
- [ ] Backup production database
- [ ] Test migration on staging environment
- [ ] Verify Redis availability (optional but recommended)
- [ ] Review new offer defaults with business team
- [ ] Confirm rollback procedure is understood

### Deployment Steps
1. **Deploy Code**: Update application with new PostbackService
2. **Run Migration**: Execute `007_conversion_capping_race_condition_fixes.sql`
3. **Verify Data**: Check validation queries return no errors
4. **Configure Redis**: Set `REDIS_URL` if using Redis
5. **Monitor**: Watch for conversion processing errors
6. **Enable Features**: Gradually configure offers with new settings

### Post-Deployment Monitoring
- **Cap Enforcement**: Verify caps are respected under load
- **Conversion Processing**: Monitor latency and error rates
- **Stats Accuracy**: Check stats updates are working
- **Postback Success**: Verify postback delivery rates

## Configuration Options

### Environment Variables
```bash
REDIS_URL=redis://localhost:6379          # Optional: For atomic counters
STATS_BUFFER_BATCH_SIZE=100               # Stats aggregation batch size
STATS_BUFFER_FLUSH_INTERVAL=30            # Seconds between flushes
```

### Offer Configuration Examples
```json
{
  "conversion_cap": 1000,
  "conversion_cap_duration": "daily",
  "max_conversions_per_click": 3,
  "conversion_window_hours": 48,
  "cap_action": "reject_conversion"
}
```

## Troubleshooting

### Common Issues

#### Migration Fails on Date Defaults
**Problem**: Some MySQL versions don't support complex date expressions
**Solution**: Run migration in MySQL 8.0+ or simplify date defaults

#### High Memory Usage During Migration
**Problem**: Large datasets cause memory issues during counter initialization
**Solution**: Run migration during low-traffic periods or in batches

#### Redis Connection Issues
**Problem**: Redis unavailable causes fallback to DB locking
**Solution**: This is expected behavior - DB locking is slower but works

### Validation Queries

#### Check Migration Success
```sql
-- Should return 0 rows
SELECT 'ERROR: Duplicate offer counters' as issue, offer_id, COUNT(*)
FROM offer_conversion_counters
GROUP BY offer_id
HAVING COUNT(*) > 1;
```

#### Monitor Cap Enforcement
```sql
SELECT
  o.name,
  o.conversion_cap,
  occ.daily_conversions,
  CASE WHEN occ.daily_conversions >= o.conversion_cap THEN 'REACHED' ELSE 'AVAILABLE' END as status
FROM offers o
JOIN offer_conversion_counters occ ON o.id = occ.offer_id
WHERE o.conversion_cap IS NOT NULL;
```

## Rollback Procedure

### When to Rollback
- Critical bugs in cap enforcement
- Performance issues with new features
- Need to revert to original behavior

### Rollback Steps
1. **Stop Traffic**: Pause postback processing if possible
2. **Run Rollback**: Execute `007_rollback_conversion_capping_race_condition_fixes.sql`
3. **Verify Removal**: Confirm all new columns/tables removed
4. **Restart Application**: Deploy code without new features
5. **Resume Traffic**: Restore normal operation

### Data Preservation
- **Existing Conversions**: Remain intact (without new fields)
- **Offer Settings**: Cap-related settings will be lost
- **Historical Data**: All conversion history preserved

## Future Enhancements

### Planned Features
- **Real-time Cap Monitoring**: Dashboard for cap status
- **Automatic Cap Adjustments**: AI-based cap optimization
- **Advanced Attribution**: Cross-device conversion linking
- **Fraud Detection**: Pattern-based conversion rejection

### Performance Optimizations
- **Counter Sharding**: Distribute counters across multiple Redis instances
- **Batch Cap Updates**: Bulk cap increment operations
- **Archive Old Counters**: Move historical data to separate tables

## Support

### Documentation Links
- Implementation Summary: `IMPLEMENTATION_SUMMARY.md`
- Quick Reference: `QUICK_REFERENCE_GUIDE.md`
- Race Condition Analysis: `CONVERSION_CAPPING_RACE_CONDITION_FIXES.md`

### Key Contacts
- **Database**: Review migration scripts carefully
- **Application**: Test PostbackService thoroughly
- **Business**: Validate cap enforcement rules
- **Operations**: Monitor performance impact

---

**Migration Version**: 007
**Date**: 2024
**Status**: Production Ready
**Risk Level**: Medium (New critical financial logic)
**Rollback Available**: Yes
