# Publisher Refactoring Documentation

## Summary

The publisher backend has been refactored to match the UI form fields. All unnecessary fields have been removed, and password support has been added.

---

## Final Reduced Field List

The backend now only accepts these fields (matching UI):

1. **email** - Required
2. **first_name** - Optional
3. **company_name** - Optional
4. **country** - Optional
5. **password** - Required (for create)
6. **global_postback_url** - Optional

---

## Final Backend JSON Payload

### Create Publisher (POST /api/admin/publishers)

```json
{
  "email": "publisher1@example.com",
  "first_name": "Amit",
  "company_name": "Amit Media Pvt Ltd",
  "country": "IN",
  "password": "securepassword123",
  "global_postback_url": "https://example.com/postback"
}
```

### Update Publisher (PATCH /api/admin/publishers/:id)

```json
{
  "email": "publisher1@example.com",
  "first_name": "Amit",
  "company_name": "Amit Media Pvt Ltd",
  "country": "IN",
  "password": "newpassword123",
  "global_postback_url": "https://example.com/postback"
}
```

**Note:** All fields are optional in update, except password must be provided if updating password.

---

## Fields Removed from Backend

The following fields have been **removed** from the publisher payload (not in UI):

- ❌ `mobile`
- ❌ `last_name`
- ❌ `position`
- ❌ `address`
- ❌ `state`
- ❌ `zip_code`
- ❌ `tax_invoice_details`
- ❌ `payment_terms`
- ❌ `status` (automatically set to 'pending' on create)

---

## Database Mapping

### Table: `publishers`

| UI Field | Backend Field | DB Column | Type | Notes |
|----------|---------------|-----------|------|-------|
| email | email | email | VARCHAR(255) | UNIQUE, NOT NULL |
| first_name | first_name | first_name | VARCHAR(100) | NULL allowed |
| company_name | company_name | company_name | VARCHAR(255) | NULL allowed |
| country | country | country | VARCHAR(100) | NULL allowed |
| password | password | password_hash | VARCHAR(255) | Hashed with bcrypt (10 rounds) |
| global_postback_url | global_postback_url | global_postback_url | TEXT | NULL allowed |

### Additional DB Columns (Not in UI, but used internally):

- `id` - AUTO_INCREMENT PRIMARY KEY
- `status` - ENUM('pending','active','suspended') - Default: 'pending'
- `created_at` - TIMESTAMP
- `updated_at` - TIMESTAMP

### Migration Required

Run the migration to add `password_hash` column:

```sql
-- File: src/db/migrations/002_add_publisher_password.sql
ALTER TABLE publishers 
ADD COLUMN password_hash VARCHAR(255) NULL AFTER email;
```

---

## Validation Rules

### Create Publisher Schema

| Field | Required | Type | Validation Rules |
|-------|----------|------|-----------------|
| email | ✅ Yes | string | Valid email format |
| first_name | ❌ No | string | Optional, can be empty/null |
| company_name | ❌ No | string | Optional, can be empty/null |
| country | ❌ No | string | Optional, can be empty/null |
| password | ✅ Yes | string | Minimum 6 characters |
| global_postback_url | ❌ No | string | Valid URI format if provided, can be empty/null |

### Update Publisher Schema

| Field | Required | Type | Validation Rules |
|-------|----------|------|-----------------|
| email | ❌ No | string | Valid email format (if provided) |
| first_name | ❌ No | string | Optional, can be empty/null |
| company_name | ❌ No | string | Optional, can be empty/null |
| country | ❌ No | string | Optional, can be empty/null |
| password | ❌ No | string | Minimum 6 characters (if provided) |
| global_postback_url | ❌ No | string | Valid URI format if provided, can be empty/null |

---

## Security Notes

1. **Password Hashing**: Passwords are hashed using `bcrypt` with 10 rounds before storing in database.
2. **Password Exclusion**: `password_hash` is never returned in API responses for security.
3. **Email Uniqueness**: Email must be unique across all publishers.
4. **Status Default**: New publishers are created with status 'pending' by default.

---

## API Endpoints

### Create Publisher
```
POST /api/admin/publishers
Authorization: Bearer <token>
Content-Type: application/json

Body: {
  "email": "publisher@example.com",
  "first_name": "John",
  "company_name": "Company Name",
  "country": "US",
  "password": "password123",
  "global_postback_url": "https://example.com/postback"
}
```

### Update Publisher
```
PATCH /api/admin/publishers/:id
Authorization: Bearer <token>
Content-Type: application/json

Body: {
  "first_name": "Jane",
  "company_name": "New Company",
  "country": "CA"
}
```

### Get Publisher
```
GET /api/admin/publishers/:id
Authorization: Bearer <token>
```

**Response** (password_hash excluded):
```json
{
  "success": true,
  "data": {
    "id": 1,
    "email": "publisher@example.com",
    "first_name": "John",
    "company_name": "Company Name",
    "country": "US",
    "global_postback_url": "https://example.com/postback",
    "status": "pending",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

---

## Files Modified

1. ✅ `src/validators/publisherValidator.js` - Updated schemas
2. ✅ `src/services/publisherService.js` - Updated create/update methods, added password hashing
3. ✅ `src/controllers/adminController.js` - Added validation to create endpoint
4. ✅ `src/db/migrations/001_initial_schema.sql` - Updated initial schema to match refactored structure
5. ✅ `src/db/migrations/002_add_publisher_password.sql` - Migration to add password_hash column
6. ✅ `src/db/migrations/003_remove_unused_publisher_columns.sql` - Migration to remove unused columns

---

## Testing Checklist

- [ ] Run database migration
- [ ] Test creating publisher with all fields
- [ ] Test creating publisher with only required fields (email, password)
- [ ] Test updating publisher fields
- [ ] Test password update
- [ ] Verify password_hash is not returned in responses
- [ ] Verify email uniqueness constraint
- [ ] Test validation errors for invalid email format
- [ ] Test validation errors for password < 6 characters

---

## Migration Instructions

### For New Installations
The initial schema (`001_initial_schema.sql`) has been updated to include the refactored publisher structure. No migration needed for fresh installations.

### For Existing Databases

Run migrations in order:

1. **Add password_hash column**:
   ```bash
   mysql -u your_user -p your_database < src/db/migrations/002_add_publisher_password.sql
   ```
   Or manually:
   ```sql
   ALTER TABLE publishers 
   ADD COLUMN password_hash VARCHAR(255) NULL AFTER email;
   ```

2. **Remove unused columns** (optional but recommended):
   ```bash
   mysql -u your_user -p your_database < src/db/migrations/003_remove_unused_publisher_columns.sql
   ```
   Or manually execute each DROP COLUMN statement:
   ```sql
   ALTER TABLE publishers DROP COLUMN mobile;
   ALTER TABLE publishers DROP COLUMN last_name;
   ALTER TABLE publishers DROP COLUMN position;
   ALTER TABLE publishers DROP COLUMN address;
   ALTER TABLE publishers DROP COLUMN state;
   ALTER TABLE publishers DROP COLUMN zip_code;
   ALTER TABLE publishers DROP COLUMN tax_invoice_details;
   ALTER TABLE publishers DROP COLUMN payment_terms;
   ```
   **Note:** If a column doesn't exist, the statement will fail. You can safely ignore errors for columns that don't exist.

3. **For existing publishers**: Consider requiring password reset or setting default passwords.

---

## Example cURL Requests

### Create Publisher
```bash
curl -X POST http://localhost:3000/api/admin/publishers \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "publisher@example.com",
    "first_name": "John",
    "company_name": "Test Company",
    "country": "US",
    "password": "password123",
    "global_postback_url": "https://example.com/postback"
  }'
```

### Update Publisher
```bash
curl -X PATCH http://localhost:3000/api/admin/publishers/1 \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "first_name": "Jane",
    "company_name": "Updated Company"
  }'
```


