# Assignment, Offer, and Publisher Flow Documentation

## Table of Contents
1. [Overview](#overview)
2. [Entity Relationship](#entity-relationship)
3. [Database Schema](#database-schema)
4. [Publisher Lifecycle](#publisher-lifecycle)
5. [Offer Lifecycle](#offer-lifecycle)
6. [Assignment Lifecycle](#assignment-lifecycle)
7. [Integration Flow](#integration-flow)
8. [Tracking Flow](#tracking-flow)
9. [Conversion/Postback Flow](#conversionpostback-flow)
10. [Capping Mechanisms](#capping-mechanisms)
11. [API Endpoints](#api-endpoints)

---

## Overview

The system manages three core entities that work together:

- **Publishers (Affiliates)**: Partners who promote offers
- **Offers**: Campaigns from advertisers that publishers promote
- **Assignments (Publisher Offers)**: The relationship between publishers and offers, containing publisher-specific configurations

### Key Concepts

- An **Offer** belongs to an **Advertiser** and defines the campaign details (payout, URL, targeting, etc.)
- A **Publisher** is an affiliate partner who can be assigned multiple offers
- An **Assignment** links a Publisher to an Offer and allows:
  - Custom payout overrides per publisher
  - Publisher-specific tracking URLs
  - Assignment-level capping (budget and conversions)
  - Custom callback URLs
  - Conversion approval percentage settings

---

## Entity Relationship

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│ Advertiser  │         │    Offer     │         │  Publisher  │
│             │────────▶│              │         │             │
│  - id       │ 1    N  │  - id        │    N    │  - id       │
│  - name     │         │  - name      │    │    │  - email    │
│  - email    │         │  - status    │    │    │  - status   │
└─────────────┘         │  - payout    │    │    │  - company  │
                        └──────────────┘    │    └─────────────┘
                               │            │           │
                               │            │           │
                               └────────────┼───────────┘
                                            │
                                      ┌─────┴──────┐
                                      │ Assignment │
                                      │            │
                                      │  - id      │
                                      │  - payout_ │
                                      │    override│
                                      │  - capping │
                                      │  - status  │
                                      └────────────┘
```

**Relationships:**
- 1 Advertiser → N Offers
- 1 Offer → N Assignments (one per publisher)
- 1 Publisher → N Assignments (one per offer)
- Assignment = Unique combination of (Publisher, Offer)

---

## Database Schema

### Publishers Table
```sql
CREATE TABLE publishers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  first_name VARCHAR(100),
  company_name VARCHAR(255),
  country VARCHAR(100),
  global_postback_url TEXT,
  status ENUM('pending','active','suspended') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
)
```

**Key Fields:**
- `status`: Controls publisher account state ('active' = can receive assignments)
- `global_postback_url`: Default callback URL for all assignments (can be overridden per assignment)

### Offers Table
```sql
CREATE TABLE offers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  advertiser_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  status ENUM('live','paused','draft') DEFAULT 'draft',
  advertiser_revenue DECIMAL(10,2),
  affiliate_model_cost DECIMAL(10,2),  -- Default payout
  offer_url VARCHAR(500) NOT NULL,
  capping_type ENUM('none','daily','monthly','weekly'),
  capping_per_day INT,
  -- ... other fields
)
```

**Key Fields:**
- `status`: 'live' = can accept clicks, 'paused' = temporarily stopped, 'draft' = not ready
- `affiliate_model_cost`: Default payout amount (can be overridden in assignment)
- `capping_type`, `capping_per_day`: Offer-level capping limits

### Publisher Offers (Assignments) Table
```sql
CREATE TABLE publisher_offers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  publisher_id INT NOT NULL,
  offer_id INT NOT NULL,
  payout_override DECIMAL(10,2),          -- Overrides offer.affiliate_model_cost
  conversion_approval_percentage DECIMAL(5,2),  -- Auto-approval percentage
  capping_budget_duration VARCHAR(20),    -- 'hour', 'day', 'week', 'month'
  capping_budget_amount DECIMAL(10,2),    -- Budget cap amount
  capping_conversions_duration VARCHAR(20),
  capping_conversions_amount INT,         -- Conversion cap count
  callback_url TEXT,                      -- Overrides publisher.global_postback_url
  offer_url TEXT,                         -- Custom tracking URL
  status ENUM('active','inactive','suspended') DEFAULT 'active',
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT,
  UNIQUE KEY uniq_publisher_offer (publisher_id, offer_id)
)
```

**Key Fields:**
- `payout_override`: If set, replaces the offer's default payout for this publisher
- `conversion_approval_percentage`: 0-100, determines auto-approval rate (e.g., 80 = 80% auto-approved)
- `capping_budget_*`: Assignment-level budget capping (spend limit)
- `capping_conversions_*`: Assignment-level conversion capping (conversion limit)
- `status`: 'active' = assignment is live, 'inactive' = soft deleted

---

## Publisher Lifecycle

### 1. Create Publisher
**Endpoint:** `POST /api/admin/publishers`

**Request Body:**
```json
{
  "email": "publisher@example.com",
  "password": "secure_password",
  "first_name": "John",
  "company_name": "Affiliate Network",
  "country": "US",
  "global_postback_url": "https://publisher.com/postback"
}
```

**Flow:**
1. Validate email uniqueness
2. Hash password using bcrypt
3. Insert into `publishers` table with `status='active'`
4. Return publisher object (without password_hash)

### 2. Update Publisher
**Endpoint:** `PATCH /api/admin/publishers/:id`

**Updates:**
- Email, name, company, country
- `global_postback_url` (affects all future assignments)
- `status`: 'active' | 'suspended' | 'pending'

### 3. Soft Delete Publisher
**Endpoint:** `DELETE /api/admin/publishers/:id`

**Flow:**
- Sets `status = 'suspended'` (soft delete)
- Does not delete from database
- Active assignments remain but publisher cannot receive new clicks

---

## Offer Lifecycle

### 1. Create Offer
**Endpoint:** `POST /api/admin/offers`

**Request Body:**
```json
{
  "advertiser_id": 1,
  "name": "Spring Promo",
  "category": "Shopping",
  "status": "draft",
  "advertiser_revenue": 25.00,
  "affiliate_model_cost": 15.00,
  "offer_url": "https://advertiser.com/promo",
  "capping_type": "daily",
  "capping_per_day": 1000
}
```

**Flow:**
1. Validate advertiser exists
2. Generate unique `url_key` from offer name
3. Insert into `offers` table
4. Default `status = 'draft'` (not yet live)

### 2. Update Offer Status
**Endpoint:** `PATCH /api/admin/offers/:id/status`

**Status Values:**
- `'draft'`: Offer created but not ready
- `'live'`: Offer is active and can receive clicks
- `'paused'`: Temporarily stopped (redirects to fallback)
- `'remove'`: Soft deleted

### 3. Update Offer
**Endpoint:** `PATCH /api/admin/offers/:id`

**Can Update:**
- Name, description, category
- Payout amounts
- URLs, targeting, capping
- Status

### 4. Soft Delete Offer
**Endpoint:** `DELETE /api/admin/offers/:id`

**Flow:**
- Sets `status = 'remove'`
- All assignments become inactive
- Clicks redirect to fallback URL

---

## Assignment Lifecycle

### 1. Create Assignment

#### Multi-Publisher Format (Recommended)
**Endpoint:** `POST /api/admin/assignments`

**Request Body:**
```json
{
  "offer_id": 1,
  "publishers": [
    {
      "publisher_id": 1,
      "payout_override": 18.00,
      "conversion_approval_percentage": 80,
      "capping_budget": {
        "duration": "day",
        "amount": 500.00
      },
      "capping_conversions": {
        "duration": "month",
        "amount": 1000
      },
      "callback_url": "https://publisher1.com/custom-postback",
      "offer_url": "https://custom.tracking.url",
      "status": "active",
      "notes": "VIP publisher"
    },
    {
      "publisher_id": 2,
      "payout_override": 15.00
    }
  ]
}
```

**Flow:**
1. Validate `offer_id` exists
2. For each publisher in array:
   - Validate `publisher_id` exists
   - Auto-generate `offer_url` if not provided:
     ```
     {BASE_URL}/click?offer_id={offer_id}&pub_id={publisher_id}&tid={TID}
     ```
   - Auto-generate `callback_url` from publisher's `global_postback_url` if not provided
   - Insert into `publisher_offers` table
   - On duplicate key (publisher_id + offer_id), update existing assignment
3. Return created assignments array + any errors

#### Legacy Single-Publisher Format
```json
{
  "publisher_id": 1,
  "offer_id": 1,
  "payout_override": 18.00,
  "notes": "Special deal"
}
```

### 2. Update Assignment
**Endpoint:** `PATCH /api/admin/assignments/:id`

**Request Body:**
```json
{
  "payout_override": 20.00,
  "conversion_approval_percentage": 90,
  "capping_budget": {
    "duration": "week",
    "amount": 1000.00
  },
  "status": "active",
  "notes": "Updated terms"
}
```

**Can Update:**
- `payout_override`
- `conversion_approval_percentage`
- `capping_budget` (duration + amount)
- `capping_conversions` (duration + amount)
- `callback_url`
- `offer_url`
- `notes`
- `status`

**Cannot Update:**
- `publisher_id` (create new assignment instead)
- `offer_id` (create new assignment instead)

### 3. Get Assignment
**Endpoint:** `GET /api/admin/assignments/:id`

**Returns:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "publisher_id": 1,
    "offer_id": 1,
    "payout_override": 18.00,
    "conversion_approval_percentage": 80,
    "capping_budget": {
      "duration": "day",
      "amount": 500.00
    },
    "capping_conversions": {
      "duration": "month",
      "amount": 1000
    },
    "callback_url": "https://publisher.com/postback",
    "offer_url": "https://tracking.url/click?offer_id=1&pub_id=1",
    "status": "active",
    "assigned_at": "2025-01-15T10:00:00Z",
    "publisher_email": "publisher@example.com",
    "publisher_company": "Affiliate Network",
    "offer_name": "Spring Promo",
    "offer_category": "Shopping"
  }
}
```

### 4. List Assignments
**Endpoint:** `GET /api/admin/assignments?publisher_id=1&offer_id=2&status=active`

**Filters:**
- `publisher_id`: Filter by publisher
- `offer_id`: Filter by offer
- `status`: Filter by assignment status

### 5. Get Tracking URL
**Endpoint:** `GET /api/admin/assignments/:id/tracking-url`

**Returns:**
```json
{
  "success": true,
  "data": {
    "tracking_url": "http://localhost:3000/click?offer_id=1&pub_id=1&tid={TID}"
  }
}
```

### 6. Soft Delete Assignment
**Endpoint:** `DELETE /api/admin/assignments/:id`

**Flow:**
- Sets `status = 'inactive'` (soft delete)
- Does not delete from database
- Assignment stops accepting new clicks
- Existing clicks/conversions remain linked

---

## Integration Flow

### Complete Assignment Creation Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. Admin Creates Offer                                      │
│    POST /api/admin/offers                                   │
│    - Sets default payout, URL, targeting                    │
│    - Status: 'draft' → 'live'                               │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Admin Creates Publisher                                  │
│    POST /api/admin/publishers                               │
│    - Sets email, company, global_postback_url               │
│    - Status: 'active'                                       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Admin Creates Assignment                                 │
│    POST /api/admin/assignments                              │
│    {                                                        │
│      "offer_id": 1,                                         │
│      "publishers": [{                                       │
│        "publisher_id": 1,                                   │
│        "payout_override": 18.00,  ← Overrides offer payout │
│        "capping_budget": {...}                              │
│      }]                                                     │
│    }                                                        │
│                                                             │
│    System:                                                  │
│    - Validates offer exists                                 │
│    - Validates publisher exists                             │
│    - Generates tracking URL                                 │
│    - Uses publisher.global_postback_url if no callback_url  │
│    - Inserts into publisher_offers                          │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Publisher Receives Tracking URL                          │
│    GET /api/admin/assignments/:id/tracking-url              │
│                                                             │
│    Returns:                                                 │
│    http://tracking.com/click?offer_id=1&pub_id=1&tid={TID} │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Publisher Promotes URL on Their Site                     │
│    User clicks → redirects to tracking URL                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Tracking Flow

### Click Tracking Process

```
User clicks tracking URL
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ GET /click?offer_id=1&pub_id=1&tid=ABC123                   │
│                                                             │
│ 1. Validate Offer                                           │
│    - Check offer exists                                     │
│    - Check offer.status === 'live'                          │
│    - If not live → redirect to fallback_url                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Validate Publisher                                       │
│    - Check publisher exists                                 │
│    - Check publisher.status === 'active'                    │
│    - If inactive → redirect to fallback_url                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Get Assignment                                           │
│    SELECT * FROM publisher_offers                           │
│    WHERE publisher_id = ? AND offer_id = ?                  │
│      AND status = 'active'                                  │
│                                                             │
│    - If assignment not found → redirect to fallback_url     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Check Assignment-Level Capping (Budget)                  │
│    - Calculate spent budget for duration                    │
│    - If capping_budget_amount exceeded → fallback           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Check Assignment-Level Capping (Conversions)             │
│    - Count conversions for duration                         │
│    - If capping_conversions_amount exceeded → fallback      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Check Offer-Level Capping                                │
│    - Check capping_type (daily/monthly/weekly)              │
│    - Check capping_per_day limit                            │
│    - If exceeded → fallback                                 │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. Record Click                                             │
│    - Generate click_uuid                                    │
│    - Extract IP, user-agent, device info                    │
│    - Insert into clicks table                               │
│    - Store publisher_offer_id (assignment.id)               │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. Redirect to Offer URL                                    │
│    - Use assignment.offer_url if set                        │
│    - Otherwise use offer.offer_url                          │
│    - Append click_uuid as query parameter                   │
│    - Return 302 redirect                                    │
└─────────────────────────────────────────────────────────────┘
```

### Click Data Stored

```sql
INSERT INTO clicks (
  click_uuid,           -- UUID v4
  offer_id,
  publisher_id,
  publisher_offer_id,   -- Links to assignment
  ip,
  user_agent,
  referrer,
  country,
  device_type,
  browser,
  os,
  source_id,
  google_id,
  android_id,
  rcid,                 -- Remote click ID
  tid,                  -- Tracking ID
  timestamp
)
```

---

## Conversion/Postback Flow

### Postback Processing

```
Advertiser sends postback
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ POST /postback?click_id={uuid}&amount=25.00&status=approved │
│   OR                                                         │
│ GET /postback?rcid=ABC123&amount=25.00                      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. Find Click (if click_id provided)                        │
│    - Lookup click by click_uuid                             │
│    - Extract offer_id, publisher_id, publisher_offer_id     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. Deduplication Check (if rcid provided)                   │
│    - Check if conversion with this rcid already exists      │
│    - If duplicate → return existing conversion              │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. Get Assignment                                           │
│    - Load assignment using publisher_offer_id               │
│    - Extract payout_override, conversion_approval_percentage│
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. Calculate Payout                                         │
│    - If assignment.payout_override exists:                  │
│        payout = assignment.payout_override                  │
│    - Else:                                                  │
│        payout = offer.affiliate_model_cost                  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. Determine Conversion Status                              │
│    - If assignment.conversion_approval_percentage is set:   │
│        Generate random 0-100                                │
│        If random <= percentage:                             │
│            status = 'approved'                              │
│        Else:                                                │
│            status = 'pending'                               │
│    - Else:                                                  │
│        Use provided status (default: 'approved')            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. Check Assignment Budget Cap                              │
│    - If cap hit → still record conversion but mark status   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 7. Insert Conversion                                        │
│    INSERT INTO conversions (                                │
│      conversion_uuid,                                       │
│      click_uuid,                                            │
│      offer_id,                                              │
│      publisher_id,                                          │
│      publisher_offer_id,  ← Links to assignment             │
│      rcid,                                                  │
│      status,           ← 'approved' or 'pending'            │
│      amount,           ← Revenue amount                     │
│      payout,           ← Calculated payout                  │
│      ...                                                    │
│    )                                                        │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ 8. Send Postback to Publisher                               │
│    - Use assignment.callback_url if set                     │
│    - Otherwise use publisher.global_postback_url            │
│    - Include conversion data                                │
└─────────────────────────────────────────────────────────────┘
```

### Conversion Data Stored

```sql
INSERT INTO conversions (
  conversion_uuid,      -- UUID v4
  click_uuid,           -- Links to original click
  offer_id,
  publisher_id,
  publisher_offer_id,   -- Links to assignment
  rcid,                 -- Remote conversion ID (for deduplication)
  status,               -- 'approved', 'pending', 'rejected'
  amount,               -- Revenue amount
  payout,               -- Calculated payout (from assignment or offer)
  ip,
  postback_payload,     -- JSON of original postback
  timestamp
)
```

---

## Capping Mechanisms

### Three-Level Capping System

The system implements capping at three levels:

1. **Assignment-Level Budget Capping**
   - Limits total spend per assignment
   - Duration: hour, day, week, month
   - Checked on both click and conversion
   - Field: `capping_budget_duration`, `capping_budget_amount`

2. **Assignment-Level Conversion Capping**
   - Limits total conversions per assignment
   - Duration: hour, day, week, month
   - Checked on both click and conversion
   - Field: `capping_conversions_duration`, `capping_conversions_amount`

3. **Offer-Level Capping**
   - Limits clicks/conversions per offer
   - Types: daily, weekly, monthly
   - Checked on click only
   - Field: `capping_type`, `capping_per_day`

### Capping Check Flow

```
Click/Conversion Request
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│ Level 1: Assignment Budget Cap                              │
│                                                             │
│ Query:                                                      │
│ SELECT SUM(amount) FROM conversions                         │
│ WHERE publisher_offer_id = ?                                │
│   AND status = 'approved'                                   │
│   AND timestamp >= {start_of_duration}                      │
│                                                             │
│ If SUM >= capping_budget_amount:                            │
│   → Return fallback / Reject conversion                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ Level 2: Assignment Conversion Cap                          │
│                                                             │
│ Query:                                                      │
│ SELECT COUNT(*) FROM conversions                            │
│ WHERE publisher_offer_id = ?                                │
│   AND status = 'approved'                                   │
│   AND timestamp >= {start_of_duration}                      │
│                                                             │
│ If COUNT >= capping_conversions_amount:                     │
│   → Return fallback / Reject conversion                     │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│ Level 3: Offer-Level Cap                                    │
│                                                             │
│ Query:                                                      │
│ SELECT COUNT(*) FROM clicks                                 │
│ WHERE offer_id = ?                                          │
│   AND DATE(timestamp) = CURDATE()                           │
│                                                             │
│ If COUNT >= capping_per_day:                                │
│   → Return fallback                                         │
└─────────────────────────────────────────────────────────────┘
```

### Example: Multi-Level Capping

```json
// Assignment Configuration
{
  "publisher_id": 1,
  "offer_id": 1,
  "capping_budget": {
    "duration": "day",
    "amount": 500.00
  },
  "capping_conversions": {
    "duration": "month",
    "amount": 1000
  }
}

// Offer Configuration
{
  "id": 1,
  "capping_type": "daily",
  "capping_per_day": 5000
}
```

**Result:**
- Assignment budget: Max $500/day spend
- Assignment conversions: Max 1000 conversions/month
- Offer: Max 5000 clicks/day (shared across all assignments)

---

## API Endpoints

### Publisher Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/publishers` | Create publisher |
| GET | `/api/admin/publishers` | List publishers (filterable) |
| GET | `/api/admin/publishers/:id` | Get publisher details |
| PATCH | `/api/admin/publishers/:id` | Update publisher |
| DELETE | `/api/admin/publishers/:id` | Soft delete (status → 'suspended') |

### Offer Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/offers` | Create offer |
| GET | `/api/admin/offers/:type` | List offers (all/live/approved) |
| GET | `/api/admin/offers/single/:id` | Get offer details |
| PATCH | `/api/admin/offers/:id` | Update offer |
| PATCH | `/api/admin/offers/:id/status` | Update offer status |
| DELETE | `/api/admin/offers/:id` | Soft delete (status → 'remove') |

### Assignment Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/assignments` | Create assignment(s) |
| GET | `/api/admin/assignments` | List assignments (filterable) |
| GET | `/api/admin/assignments/:id` | Get assignment details |
| GET | `/api/admin/assignments/:id/tracking-url` | Get tracking URL |
| PATCH | `/api/admin/assignments/:id` | Update assignment |
| DELETE | `/api/admin/assignments/:id` | Soft delete (status → 'inactive') |

### Tracking Endpoints (Public)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/click` | Track click and redirect |
| GET | `/imp` | Track impression |
| GET/POST | `/postback` | Process conversion postback |

---

## Key Business Rules

### Assignment Rules

1. **Unique Constraint**: One assignment per (publisher_id, offer_id) combination
2. **Status Hierarchy**: Assignment only works if:
   - Publisher status = 'active'
   - Offer status = 'live'
   - Assignment status = 'active'
3. **Payout Priority**: `assignment.payout_override` > `offer.affiliate_model_cost`
4. **URL Priority**: `assignment.offer_url` > `offer.offer_url`
5. **Callback Priority**: `assignment.callback_url` > `publisher.global_postback_url`

### Conversion Approval

- If `conversion_approval_percentage` is set (0-100):
  - Random value (0-100) is generated
  - If random ≤ percentage: Status = 'approved'
  - Else: Status = 'pending' (requires manual review)
- If `conversion_approval_percentage` is NULL:
  - Use status from postback (default: 'approved')

### Soft Delete Behavior

- **Publisher**: Status → 'suspended' (cannot receive clicks)
- **Offer**: Status → 'remove' (redirects to fallback)
- **Assignment**: Status → 'inactive' (not returned in queries)

All soft deletes preserve data for reporting and audit purposes.

---

## Example Workflow

### Complete End-to-End Flow

1. **Admin creates advertiser**
   ```
   POST /api/admin/advertisers
   { "name": "Acme Corp", "email": "acme@example.com" }
   ```

2. **Admin creates offer**
   ```
   POST /api/admin/offers
   {
     "advertiser_id": 1,
     "name": "Spring Sale",
     "affiliate_model_cost": 15.00,
     "status": "live"
   }
   ```

3. **Admin creates publisher**
   ```
   POST /api/admin/publishers
   {
     "email": "affiliate@example.com",
     "global_postback_url": "https://affiliate.com/postback"
   }
   ```

4. **Admin creates assignment**
   ```
   POST /api/admin/assignments
   {
     "offer_id": 1,
     "publishers": [{
       "publisher_id": 1,
       "payout_override": 18.00,
       "conversion_approval_percentage": 80
     }]
   }
   ```

5. **Publisher gets tracking URL**
   ```
   GET /api/admin/assignments/1/tracking-url
   Returns: http://tracking.com/click?offer_id=1&pub_id=1&tid={TID}
   ```

6. **User clicks tracking URL**
   ```
   GET /click?offer_id=1&pub_id=1&tid=ABC123
   → System records click
   → Redirects to offer URL
   ```

7. **Advertiser sends postback**
   ```
   POST /postback?click_id={uuid}&amount=25.00
   → System calculates payout (18.00 from assignment)
   → Auto-approves if random ≤ 80%
   → Records conversion
   → Sends postback to publisher callback URL
   ```

8. **Reporting**
   ```
   GET /api/admin/reports/summary
   → Shows clicks, conversions, revenue, payout, profit
   → Filterable by publisher_id, offer_id, assignment
   ```

---

## Troubleshooting

### Assignment Not Working

1. Check publisher status = 'active'
2. Check offer status = 'live'
3. Check assignment status = 'active'
4. Verify assignment exists for (publisher_id, offer_id)
5. Check capping limits not exceeded

### Conversion Not Approved

1. Check `conversion_approval_percentage` setting
2. If percentage < 100, some conversions will be 'pending'
3. Manual approval required for pending conversions

### Postback Not Received

1. Verify `assignment.callback_url` or `publisher.global_postback_url`
2. Check postback URL is accessible
3. Verify conversion was recorded successfully

---

*Last Updated: 2025-01-15*

