# Assignment System Refactoring Documentation

## Summary

The assignment system has been refactored to support assigning multiple publishers to a single offer in one API request, while maintaining backward compatibility with single-publisher assignments.

---

## A) Database Schema Update

### Migration File: `004_add_assignment_fields.sql`

```sql
ALTER TABLE publisher_offers 
ADD COLUMN conversion_approval_percentage DECIMAL(5,2) NULL DEFAULT NULL,
ADD COLUMN capping_budget_duration VARCHAR(20) NULL DEFAULT NULL,
ADD COLUMN capping_budget_amount DECIMAL(10,2) NULL DEFAULT NULL,
ADD COLUMN capping_conversions_duration VARCHAR(20) NULL DEFAULT NULL,
ADD COLUMN capping_conversions_amount INT NULL DEFAULT NULL,
ADD COLUMN callback_url TEXT NULL DEFAULT NULL,
ADD COLUMN offer_url TEXT NULL DEFAULT NULL;

-- Add indexes for better query performance
ALTER TABLE publisher_offers 
ADD KEY idx_po_capping_budget (capping_budget_duration, capping_budget_amount),
ADD KEY idx_po_capping_conversions (capping_conversions_duration, capping_conversions_amount);
```

### New Columns Added:

| Column | Type | Null | Default | Description |
|--------|------|------|---------|-------------|
| `conversion_approval_percentage` | DECIMAL(5,2) | YES | NULL | Percentage of conversions to auto-approve (0-100) |
| `capping_budget_duration` | VARCHAR(20) | YES | NULL | Duration for budget cap: 'hour', 'day', 'week', 'month' |
| `capping_budget_amount` | DECIMAL(10,2) | YES | NULL | Budget cap amount |
| `capping_conversions_duration` | VARCHAR(20) | YES | NULL | Duration for conversion cap: 'hour', 'day', 'week', 'month' |
| `capping_conversions_amount` | INT | YES | NULL | Maximum conversions allowed |
| `callback_url` | TEXT | YES | NULL | Publisher-specific callback/postback URL |
| `offer_url` | TEXT | YES | NULL | Publisher-specific tracking URL |

---

## B) Backend Payload Contract

### Required Fields:
- `offer_id` (number, integer, positive) - The offer to assign publishers to
- `publishers` (array, min 1 item) - Array of publisher assignments

### Publishers Array Structure:

Each publisher object in the `publishers[]` array:

| Field | Type | Required | Validation Rules |
|-------|------|----------|-----------------|
| `publisher_id` | number | ✅ Yes | Integer, positive |
| `payout_override` | number | ❌ No | Positive number, nullable |
| `conversion_approval_percentage` | number | ❌ No | 0-100, nullable |
| `capping_budget` | object | ❌ No | Object with `duration` and `amount` |
| `capping_budget.duration` | string | ✅ If capping_budget provided | Enum: 'hour', 'day', 'week', 'month' |
| `capping_budget.amount` | number | ✅ If capping_budget provided | Min: 0 |
| `capping_conversions` | object | ❌ No | Object with `duration` and `amount` |
| `capping_conversions.duration` | string | ✅ If capping_conversions provided | Enum: 'hour', 'day', 'week', 'month' |
| `capping_conversions.amount` | number | ✅ If capping_conversions provided | Min: 0, integer |
| `callback_url` | string | ❌ No | Valid URI, nullable, empty string allowed |
| `offer_url` | string | ❌ No | Valid URI, nullable, empty string allowed |
| `notes` | string | ❌ No | Text, nullable, empty string allowed |
| `status` | string | ❌ No | Enum: 'active', 'inactive', 'suspended', default: 'active' |

### Auto-Generated Fields:

- **`offer_url`**: If not provided, auto-generated using `generateTrackingURL()` with base URL from `BASE_URL` or `TRACKING_BASE_URL` env variable
- **`callback_url`**: If not provided, uses publisher's `global_postback_url` if available

---

## C) AssignmentService.create() - Multi-Publisher Version

### Key Features:

1. **Dual Format Support**: Automatically detects if payload is multi-publisher (`publishers[]`) or single-publisher (legacy format)
2. **Batch Processing**: Processes all publishers in a single transaction
3. **Error Handling**: Continues processing even if some publishers fail, returns errors array
4. **Auto-URL Generation**: Generates `offer_url` and `callback_url` if not provided
5. **Upsert Logic**: Uses `ON DUPLICATE KEY UPDATE` to update existing assignments

### Response Format:

**Multi-Publisher Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "publisher_id": 7,
      "offer_id": 10,
      "payout_override": 1.50,
      "conversion_approval_percentage": 50,
      "capping_budget": { "duration": "day", "amount": 100 },
      "capping_conversions": { "duration": "day", "amount": 50 },
      "callback_url": "https://affiliate.com/postback?click_id={click_id}&payout={payout}",
      "offer_url": "https://pulpy.com/click?offer_id=10&publisher_id=7&tid={TID}",
      "notes": "Top publisher",
      "status": "active",
      "assigned_at": "2024-01-01T00:00:00.000Z",
      "publisher_email": "publisher@example.com",
      "publisher_company": "Publisher Co",
      "offer_name": "Test Offer",
      "offer_category": "CPA"
    }
  ],
  "errors": [
    {
      "index": 1,
      "publisher_id": 9,
      "error": "Publisher with id 9 not found"
    }
  ],
  "message": "Created 1 assignment(s) with 1 error(s)"
}
```

**Single-Publisher Response (Legacy):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "publisher_id": 7,
    "offer_id": 10,
    ...
  }
}
```

---

## D) Updated findById() and findAll()

Both methods now return formatted assignments with:
- All new fields included
- Nested `capping_budget` and `capping_conversions` objects
- Related publisher and offer data

### Example Response:

```json
{
  "id": 1,
  "publisher_id": 7,
  "offer_id": 10,
  "payout_override": 1.50,
  "cap_override": null,
  "conversion_approval_percentage": 50,
  "capping_budget": {
    "duration": "day",
    "amount": 100
  },
  "capping_conversions": {
    "duration": "day",
    "amount": 50
  },
  "callback_url": "https://affiliate.com/postback?click_id={click_id}&payout={payout}",
  "offer_url": "https://pulpy.com/click?offer_id=10&publisher_id=7&tid={TID}",
  "notes": "Top publisher",
  "status": "active",
  "assigned_at": "2024-01-01T00:00:00.000Z",
  "publisher_email": "publisher@example.com",
  "publisher_company": "Publisher Co",
  "offer_name": "Test Offer",
  "offer_category": "CPA"
}
```

---

## E) Validation Schema (Joi)

### Complete Schema Structure:

```javascript
// Capping schema (reusable)
const cappingSchema = Joi.object({
  duration: Joi.string().valid('hour', 'day', 'week', 'month').required(),
  amount: Joi.number().min(0).required(),
});

// Publisher assignment schema
const publisherAssignmentSchema = Joi.object({
  publisher_id: Joi.number().integer().positive().required(),
  payout_override: Joi.number().positive().allow(null).optional(),
  conversion_approval_percentage: Joi.number().min(0).max(100).allow(null).optional(),
  capping_budget: cappingSchema.allow(null).optional(),
  capping_conversions: cappingSchema.allow(null).optional(),
  callback_url: Joi.string().uri().allow('', null).optional(),
  offer_url: Joi.string().uri().allow('', null).optional(),
  notes: Joi.string().allow('', null).optional(),
  status: Joi.string().valid('active', 'inactive', 'suspended').default('active').optional(),
});

// Main schema
export const createAssignmentSchema = Joi.object({
  offer_id: Joi.number().integer().positive().required(),
  publishers: Joi.array().items(publisherAssignmentSchema).min(1).required(),
});
```

### Validation Rules:

- **offer_id**: Required, positive integer
- **publishers**: Required array with minimum 1 item
- **publisher_id**: Required, positive integer
- **payout_override**: Optional, positive number or null
- **conversion_approval_percentage**: Optional, 0-100 or null
- **capping_budget.duration**: Required if capping_budget provided, enum: 'hour', 'day', 'week', 'month'
- **capping_budget.amount**: Required if capping_budget provided, min: 0
- **capping_conversions.duration**: Required if capping_conversions provided, enum: 'hour', 'day', 'week', 'month'
- **capping_conversions.amount**: Required if capping_conversions provided, min: 0, integer
- **callback_url**: Optional, valid URI or empty string or null
- **offer_url**: Optional, valid URI or empty string or null
- **notes**: Optional, string or empty string or null
- **status**: Optional, enum: 'active', 'inactive', 'suspended', default: 'active'

---

## F) Final Backend Contract

### Multi-Publisher Format (Primary):

```json
{
  "offer_id": 10,
  "publishers": [
    {
      "publisher_id": 7,
      "payout_override": 1.50,
      "conversion_approval_percentage": 50,
      "capping_budget": {
        "duration": "day",
        "amount": 100
      },
      "capping_conversions": {
        "duration": "day",
        "amount": 50
      },
      "callback_url": "https://affiliate.com/postback?click_id={click_id}&payout={payout}",
      "offer_url": "https://pulpy.com/click?offer_id=10&publisher_id=7&tid={TID}",
      "notes": "Top publisher",
      "status": "active"
    },
    {
      "publisher_id": 9,
      "payout_override": 2.00,
      "conversion_approval_percentage": 70,
      "capping_budget": {
        "duration": "month",
        "amount": 500
      },
      "capping_conversions": {
        "duration": "month",
        "amount": 200
      },
      "callback_url": "https://aff9.com/cb?cid={click_id}",
      "offer_url": "https://pulpy.com/click?offer_id=10&publisher_id=9&tid={TID}",
      "notes": "",
      "status": "active"
    }
  ]
}
```

### Single Publisher Format (Fallback - Legacy Support):

```json
{
  "publisher_id": 7,
  "offer_id": 10,
  "payout_override": 1.50,
  "cap_override": 100,
  "notes": "Top publisher"
}
```

**Note**: The system automatically detects the format and processes accordingly.

---

## API Endpoint

### Create Assignment(s)

```
POST /api/admin/assignments
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body**: See "Final Backend Contract" above

**Response (201 Created)**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "publisher_id": 7,
      "offer_id": 10,
      ...
    }
  ],
  "errors": [],
  "message": "Successfully created 2 assignment(s)"
}
```

---

## Migration Instructions

1. **Run the migration**:
   ```bash
   mysql -u your_user -p your_database < src/db/migrations/004_add_assignment_fields.sql
   ```

2. **Or manually execute**:
   ```sql
   ALTER TABLE publisher_offers 
   ADD COLUMN conversion_approval_percentage DECIMAL(5,2) NULL DEFAULT NULL,
   ADD COLUMN capping_budget_duration VARCHAR(20) NULL DEFAULT NULL,
   ADD COLUMN capping_budget_amount DECIMAL(10,2) NULL DEFAULT NULL,
   ADD COLUMN capping_conversions_duration VARCHAR(20) NULL DEFAULT NULL,
   ADD COLUMN capping_conversions_amount INT NULL DEFAULT NULL,
   ADD COLUMN callback_url TEXT NULL DEFAULT NULL,
   ADD COLUMN offer_url TEXT NULL DEFAULT NULL;
   ```

---

## Example cURL Requests

### Multi-Publisher Assignment

```bash
curl -X POST http://localhost:3000/api/admin/assignments \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "offer_id": 10,
    "publishers": [
      {
        "publisher_id": 7,
        "payout_override": 1.50,
        "conversion_approval_percentage": 50,
        "capping_budget": { "duration": "day", "amount": 100 },
        "capping_conversions": { "duration": "day", "amount": 50 },
        "callback_url": "https://affiliate.com/postback?click_id={click_id}&payout={payout}",
        "offer_url": "https://pulpy.com/click?offer_id=10&publisher_id=7&tid={TID}",
        "notes": "Top publisher",
        "status": "active"
      }
    ]
  }'
```

### Single Publisher (Legacy Format)

```bash
curl -X POST http://localhost:3000/api/admin/assignments \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "publisher_id": 7,
    "offer_id": 10,
    "payout_override": 1.50,
    "notes": "Top publisher"
  }'
```

---

## Files Modified

1. ✅ `src/db/migrations/004_add_assignment_fields.sql` - Database migration
2. ✅ `src/validators/assignmentValidator.js` - Updated validation schema
3. ✅ `src/services/assignmentService.js` - Multi-publisher support
4. ✅ `src/controllers/adminController.js` - Updated response handling

---

## Testing Checklist

- [ ] Run database migration
- [ ] Test multi-publisher assignment (2+ publishers)
- [ ] Test single-publisher assignment (legacy format)
- [ ] Test with auto-generated URLs (missing offer_url/callback_url)
- [ ] Test validation errors (invalid publisher_id, offer_id, etc.)
- [ ] Test partial failures (some publishers succeed, some fail)
- [ ] Test duplicate assignments (ON DUPLICATE KEY UPDATE)
- [ ] Test findById() returns formatted data
- [ ] Test findAll() returns formatted data
- [ ] Test capping_budget and capping_conversions persistence
- [ ] Test conversion_approval_percentage validation (0-100)


