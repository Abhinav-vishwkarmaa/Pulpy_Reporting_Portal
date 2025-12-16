# Database Schema Update Summary

## Publisher Offers Table - Updated Schema

The `publisher_offers` table has been updated to support the new multi-publisher assignment system.

### Updated Initial Schema (`001_initial_schema.sql`)

The `publisher_offers` table now includes all new fields directly in the CREATE TABLE statement:

```sql
CREATE TABLE IF NOT EXISTS publisher_offers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  publisher_id INT NOT NULL,
  offer_id INT NOT NULL,
  payout_override DECIMAL(10,2),
  cap_override INT,
  conversion_approval_percentage DECIMAL(5,2) NULL DEFAULT NULL,
  capping_budget_duration VARCHAR(20) NULL DEFAULT NULL,
  capping_budget_amount DECIMAL(10,2) NULL DEFAULT NULL,
  capping_conversions_duration VARCHAR(20) NULL DEFAULT NULL,
  capping_conversions_amount INT NULL DEFAULT NULL,
  callback_url TEXT NULL DEFAULT NULL,
  offer_url TEXT NULL DEFAULT NULL,
  status ENUM('active','inactive','suspended') DEFAULT 'active',
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  UNIQUE KEY uniq_publisher_offer (publisher_id, offer_id),
  CONSTRAINT fk_po_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE CASCADE,
  CONSTRAINT fk_po_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
  KEY idx_po_status (status),
  KEY idx_po_capping_budget (capping_budget_duration, capping_budget_amount),
  KEY idx_po_capping_conversions (capping_conversions_duration, capping_conversions_amount)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### New Fields Added:

| Field | Type | Null | Default | Description |
|-------|------|------|---------|-------------|
| `conversion_approval_percentage` | DECIMAL(5,2) | YES | NULL | Percentage of conversions to auto-approve (0-100) |
| `capping_budget_duration` | VARCHAR(20) | YES | NULL | Duration for budget cap: 'hour', 'day', 'week', 'month' |
| `capping_budget_amount` | DECIMAL(10,2) | YES | NULL | Budget cap amount |
| `capping_conversions_duration` | VARCHAR(20) | YES | NULL | Duration for conversion cap: 'hour', 'day', 'week', 'month' |
| `capping_conversions_amount` | INT | YES | NULL | Maximum conversions allowed |
| `callback_url` | TEXT | YES | NULL | Publisher-specific callback/postback URL |
| `offer_url` | TEXT | YES | NULL | Publisher-specific tracking URL |

### New Indexes Added:

- `idx_po_capping_budget` - Composite index on `(capping_budget_duration, capping_budget_amount)`
- `idx_po_capping_conversions` - Composite index on `(capping_conversions_duration, capping_conversions_amount)`

---

## Migration Instructions

### For New Installations

✅ **No migration needed!** The initial schema (`001_initial_schema.sql`) now includes all new fields. Simply run the initial schema file.

### For Existing Databases

Run the migration file to add the new columns:

```bash
mysql -u your_user -p your_database < src/db/migrations/004_add_assignment_fields.sql
```

Or manually execute:

```sql
ALTER TABLE publisher_offers 
ADD COLUMN conversion_approval_percentage DECIMAL(5,2) NULL DEFAULT NULL,
ADD COLUMN capping_budget_duration VARCHAR(20) NULL DEFAULT NULL,
ADD COLUMN capping_budget_amount DECIMAL(10,2) NULL DEFAULT NULL,
ADD COLUMN capping_conversions_duration VARCHAR(20) NULL DEFAULT NULL,
ADD COLUMN capping_conversions_amount INT NULL DEFAULT NULL,
ADD COLUMN callback_url TEXT NULL DEFAULT NULL,
ADD COLUMN offer_url TEXT NULL DEFAULT NULL;

ALTER TABLE publisher_offers 
ADD KEY idx_po_capping_budget (capping_budget_duration, capping_budget_amount),
ADD KEY idx_po_capping_conversions (capping_conversions_duration, capping_conversions_amount);
```

---

## Complete Field List

### Existing Fields (Legacy):
- `id` - Primary key
- `publisher_id` - Foreign key to publishers
- `offer_id` - Foreign key to offers
- `payout_override` - Override payout amount
- `cap_override` - Override cap limit (legacy field)
- `status` - Assignment status
- `assigned_at` - Assignment timestamp
- `notes` - Assignment notes

### New Fields:
- `conversion_approval_percentage` - Auto-approval percentage
- `capping_budget_duration` - Budget cap duration
- `capping_budget_amount` - Budget cap amount
- `capping_conversions_duration` - Conversion cap duration
- `capping_conversions_amount` - Conversion cap amount
- `callback_url` - Publisher callback URL
- `offer_url` - Publisher tracking URL

---

## Files Updated

1. ✅ `src/db/migrations/001_initial_schema.sql` - Updated CREATE TABLE statement
2. ✅ `src/db/migrations/004_add_assignment_fields.sql` - Migration file for existing databases

---

## Backward Compatibility

- All new fields are **NULLABLE** - existing assignments will continue to work
- Legacy `cap_override` field is still present for backward compatibility
- The assignment service supports both old and new formats


