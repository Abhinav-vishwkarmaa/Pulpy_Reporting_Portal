# Pulpy Reporting Portal - Complete API Documentation

## Table of Contents

1. [Authentication](#authentication)
2. [Admin APIs](#admin-apis)
   - [Publishers](#publishers)
   - [Offers](#offers)
   - [Advertisers](#advertisers)
   - [Assignments](#assignments)
   - [Test Conversion](#test-conversion)
3. [Tracking APIs](#tracking-apis)
4. [Postback APIs](#postback-apis)
5. [Reporting APIs](#reporting-apis)
6. [Database Schema](#database-schema)
7. [Error Responses](#error-responses)

---

## Authentication

### Base URL
```
http://localhost:3000
```

### Authentication Methods

#### 1. Basic Authentication (Admin Routes)
Most admin routes require Basic Authentication:
```
Authorization: Basic base64(email:password)
```

**Example:**
```bash
curl -H "Authorization: Basic $(echo -n 'admin@bng.com:admin123' | base64)" \
  http://localhost:3000/api/admin/publishers
```

#### 2. JWT Token (Some Routes)
Some routes use JWT tokens obtained from `/api/auth/login`:
```
Authorization: Bearer <jwt_token>
```

---

## Admin APIs

Base Path: `/api/admin`

### Publishers

#### 1. Create Publisher

**Endpoint:** `POST /api/admin/publishers`

**Authentication:** Required (Basic Auth)

**Request Body:**
```json
{
  "email": "publisher@example.com",
  "first_name": "John",
  "company_name": "Example Media",
  "country": "US",
  "password": "password123",
  "global_postback_url": "https://publisher.com/postback?click_id={click_id}&payout={payout}"
}
```

**Request Schema:**
- `email` (string, required): Valid email address, must be unique
- `first_name` (string, optional): Publisher's first name
- `company_name` (string, optional): Company name
- `country` (string, optional): Country code (e.g., "US", "IN")
- `password` (string, required): Minimum 6 characters
- `global_postback_url` (string, optional): Postback URL for conversions. Supports macros: `{click_id}`, `{payout}`, `{amount}`, `{status}`

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "email": "publisher@example.com",
    "first_name": "John",
    "company_name": "Example Media",
    "country": "US",
    "global_postback_url": "https://publisher.com/postback?click_id={click_id}&payout={payout}",
    "status": "active",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

**Error Responses:**
- `400`: Validation error
- `409`: Email already exists
- `401`: Unauthorized

---

#### 2. List Publishers

**Endpoint:** `GET /api/admin/publishers`

**Authentication:** Required (Basic Auth)

**Query Parameters:**
- `status` (optional): Filter by status (`pending`, `active`, `suspended`)
- `page` (optional): Page number (default: 1)
- `limit` (optional): Items per page (default: 50)

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "email": "publisher@example.com",
      "first_name": "John",
      "company_name": "Example Media",
      "country": "US",
      "global_postback_url": "https://publisher.com/postback",
      "status": "active",
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1,
    "totalPages": 1
  }
}
```

---

#### 3. Get Publisher by ID

**Endpoint:** `GET /api/admin/publishers/:id`

**Authentication:** Required (Basic Auth)

**Path Parameters:**
- `id` (integer, required): Publisher ID

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "email": "publisher@example.com",
    "first_name": "John",
    "company_name": "Example Media",
    "country": "US",
    "global_postback_url": "https://publisher.com/postback",
    "status": "active",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
}
```

**Error Responses:**
- `404`: Publisher not found
- `401`: Unauthorized

---

#### 4. Update Publisher

**Endpoint:** `PATCH /api/admin/publishers/:id`

**Authentication:** Required (Basic Auth)

**Path Parameters:**
- `id` (integer, required): Publisher ID

**Request Body:**
```json
{
  "email": "newemail@example.com",
  "first_name": "Jane",
  "company_name": "New Company",
  "country": "UK",
  "password": "newpassword123",
  "global_postback_url": "https://newurl.com/postback",
  "status": "active"
}
```

**Request Schema:**
- All fields are optional
- `status`: Must be one of: `pending`, `active`, `suspended`
- `password`: Minimum 6 characters if provided
- `global_postback_url`: Valid URI or empty string

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "email": "newemail@example.com",
    "first_name": "Jane",
    "company_name": "New Company",
    "country": "UK",
    "global_postback_url": "https://newurl.com/postback",
    "status": "active",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T12:00:00.000Z"
  }
}
```

---

#### 5. Delete Publisher

**Endpoint:** `DELETE /api/admin/publishers/:id`

**Authentication:** Required (Basic Auth)

**Path Parameters:**
- `id` (integer, required): Publisher ID

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Publisher deleted successfully"
}
```

**Note:** This is a soft delete. The publisher's status is set to `suspended`.

---

### Offers

#### 1. Create Offer

**Endpoint:** `POST /api/admin/offers`

**Authentication:** Required (JWT Bearer Token)

**Request Body:**
```json
{
  "advertiser_id": 1,
  "name": "Premium Subscription Offer",
  "description": "Get premium subscription",
  "category": "SaaS",
  "status": "live",
  "offer_currency": "USD",
  "country": "US",
  "advertiser_model": "CPA",
  "advertiser_amount": 10.00,
  "affiliate_model": "CPA",
  "affiliate_amount": 5.00,
  "offer_url": "https://example.com/offer",
  "preview_url": "https://example.com/preview",
  "start_date": "2024-01-01",
  "end_date": "2024-12-31",
  "capping_type": "daily",
  "daily_cap": 1000,
  "total_cap": 100000
}
```

**Request Schema:**
- `advertiser_id` (integer, required): Advertiser ID
- `name` (string, required): Offer name
- `description` (string, optional): Offer description
- `category` (string, optional): Offer category
- `status` (enum, optional): `live`, `paused`, `draft` (default: `draft`)
- `offer_currency` (string, required): Currency code (e.g., "USD")
- `country` (string, required): Target country
- `advertiser_model` (string, required): Revenue model (`CPA`, `CPC`, `CPM`, etc.)
- `advertiser_amount` (number, required): Revenue amount
- `affiliate_model` (string, required): Payout model
- `affiliate_amount` (number, required): Payout amount
- `offer_url` (string, required): Landing page URL
- `preview_url` (string, optional): Preview URL
- `start_date` (date, optional): Start date (YYYY-MM-DD)
- `end_date` (date, optional): End date (YYYY-MM-DD)
- `capping_type` (enum, optional): `none`, `daily`, `weekly`, `monthly`
- `daily_cap` (integer, optional): Daily conversion cap
- `monthly_cap` (integer, optional): Monthly conversion cap
- `total_cap` (integer, optional): Total conversion cap

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "advertiser_id": 1,
    "name": "Premium Subscription Offer",
    "status": "live",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

---

#### 2. List Offers

**Endpoint:** `GET /api/admin/offers`

**Authentication:** Not required (Public)

**Query Parameters:**
- `type` (optional): Filter by type (`all`, `live`, `approved`)
- `category` (optional): Filter by category
- `advertiser_id` (optional): Filter by advertiser ID
- `status` (optional): Filter by status
- `page` (optional): Page number
- `limit` (optional): Items per page

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "advertiser_id": 1,
      "name": "Premium Subscription Offer",
      "category": "SaaS",
      "status": "live",
      "offer_currency": "USD",
      "country": "US",
      "affiliate_amount": 5.00,
      "created_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1,
    "totalPages": 1
  }
}
```

---

#### 3. Get Offer by ID (with Details)

**Endpoint:** `GET /api/admin/offers/single/:id`

**Authentication:** Required (Basic Auth)

**Path Parameters:**
- `id` (integer, required): Offer ID

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "advertiser_id": 1,
    "name": "Premium Subscription Offer",
    "description": "Get premium subscription",
    "category": "SaaS",
    "status": "live",
    "advertiser": {
      "id": 1,
      "name": "Example Advertiser",
      "email": "advertiser@example.com"
    },
    "assignments": [
      {
        "id": 1,
        "publisher_id": 1,
        "publisher_email": "publisher@example.com",
        "payout_override": 6.00,
        "conversion_approval_percentage": 50,
        "capping_budget": {
          "duration": "day",
          "amount": 100
        },
        "capping_conversions": {
          "duration": "day",
          "amount": 50
        },
        "callback_url": "https://publisher.com/postback",
        "offer_url": "https://tracking.com/click?offer_id=1&publisher_id=1",
        "status": "active"
      }
    ],
    "statistics": {
      "total_clicks": 1000,
      "total_conversions": 100,
      "total_revenue": 1000.00,
      "total_payout": 500.00,
      "conversion_rate": 10.00
    },
    "recent_clicks": [...],
    "recent_conversions": [...],
    "clicks_by_publisher": [...]
  }
}
```

---

#### 4. Update Offer

**Endpoint:** `PATCH /api/admin/offers/:id`

**Authentication:** Required (JWT Bearer Token)

**Path Parameters:**
- `id` (integer, required): Offer ID

**Request Body:** Same as Create Offer (all fields optional)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Updated Offer Name",
    "updated_at": "2024-01-01T12:00:00.000Z"
  }
}
```

---

#### 5. Change Offer Status

**Endpoint:** `PATCH /api/admin/offers/:id/status`

**Authentication:** Required (JWT Bearer Token)

**Path Parameters:**
- `id` (integer, required): Offer ID

**Request Body:**
```json
{
  "status": "paused"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "status": "paused"
  }
}
```

---

#### 6. Delete Offer

**Endpoint:** `DELETE /api/admin/offers/:id`

**Authentication:** Required (JWT Bearer Token)

**Path Parameters:**
- `id` (integer, required): Offer ID

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Offer deleted successfully"
}
```

---

### Advertisers

#### 1. Create Advertiser

**Endpoint:** `POST /api/admin/advertisers`

**Authentication:** Required (JWT Bearer Token)

**Request Body:**
```json
{
  "name": "John Doe",
  "email": "advertiser@example.com",
  "company_name": "Example Corp",
  "country": "US",
  "website": "https://example.com",
  "notes": "Premium advertiser"
}
```

**Request Schema:**
- `name` (string, required): Advertiser name
- `email` (string, required): Valid email, must be unique
- `company_name` (string, optional): Company name
- `country` (string, optional): Country code
- `website` (string, optional): Website URL
- `notes` (string, optional): Additional notes

**Response (201 Created):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "John Doe",
    "email": "advertiser@example.com",
    "company_name": "Example Corp",
    "country": "US",
    "website": "https://example.com",
    "status": "active",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

---

#### 2. List Advertisers

**Endpoint:** `GET /api/admin/advertisers`

**Authentication:** Required (JWT Bearer Token)

**Query Parameters:**
- `status` (optional): Filter by status (`active`, `inactive`)
- `page` (optional): Page number
- `limit` (optional): Items per page

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "John Doe",
      "email": "advertiser@example.com",
      "company_name": "Example Corp",
      "status": "active"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 1,
    "totalPages": 1
  }
}
```

---

#### 3. Get Advertiser by ID

**Endpoint:** `GET /api/admin/advertisers/:id`

**Authentication:** Required (JWT Bearer Token)

**Path Parameters:**
- `id` (integer, required): Advertiser ID

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "John Doe",
    "email": "advertiser@example.com",
    "company_name": "Example Corp",
    "country": "US",
    "website": "https://example.com",
    "status": "active",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

---

#### 4. Update Advertiser

**Endpoint:** `PATCH /api/admin/advertisers/:id`

**Authentication:** Required (JWT Bearer Token)

**Path Parameters:**
- `id` (integer, required): Advertiser ID

**Request Body:** Same as Create Advertiser (all fields optional)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Updated Name",
    "updated_at": "2024-01-01T12:00:00.000Z"
  }
}
```

---

#### 5. Delete Advertiser

**Endpoint:** `DELETE /api/admin/advertisers/:id`

**Authentication:** Required (JWT Bearer Token)

**Path Parameters:**
- `id` (integer, required): Advertiser ID

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Advertiser deleted successfully"
}
```

---

### Assignments

#### 1. Create Assignment (Multi-Publisher)

**Endpoint:** `POST /api/admin/assignments`

**Authentication:** Required (Basic Auth)

**Request Body:**
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

**Request Schema:**
- `offer_id` (integer, required): Offer ID
- `publishers` (array, required): Array of publisher assignments (min 1)
  - `publisher_id` (integer, required): Publisher ID
  - `payout_override` (number, optional): Override payout amount
  - `conversion_approval_percentage` (number, optional): Auto-approval percentage (0-100)
  - `capping_budget` (object, optional): Budget cap settings
    - `duration` (enum, required): `hour`, `day`, `week`, `month`
    - `amount` (number, required): Cap amount (>= 0)
  - `capping_conversions` (object, optional): Conversion cap settings
    - `duration` (enum, required): `hour`, `day`, `week`, `month`
    - `amount` (integer, required): Cap count (>= 0)
  - `callback_url` (string, optional): Publisher postback URL (supports macros)
  - `offer_url` (string, optional): Publisher-specific tracking URL (supports macros: `{TID}`, `{RCID}`, `{CLICK_ID}`)
  - `notes` (string, optional): Assignment notes
  - `status` (enum, optional): `active`, `inactive`, `suspended` (default: `active`)

**Response (201 Created):**
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
      "status": "active",
      "assigned_at": "2024-01-01T00:00:00.000Z"
    },
    {
      "id": 2,
      "publisher_id": 9,
      "offer_id": 10,
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
      "status": "active",
      "assigned_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "errors": [],
  "message": "Successfully created 2 assignment(s)"
}
```

**Partial Success Response:**
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

**Note:** If `callback_url` or `offer_url` are not provided, they are auto-generated:
- `offer_url`: Generated using `BASE_URL` environment variable
- `callback_url`: Uses publisher's `global_postback_url` if available

---

#### 2. List Assignments

**Endpoint:** `GET /api/admin/assignments`

**Authentication:** Required (Basic Auth)

**Query Parameters:**
- `publisher_id` (optional): Filter by publisher ID
- `offer_id` (optional): Filter by offer ID
- `status` (optional): Filter by status (`active`, `inactive`, `suspended`)

**Response (200 OK):**
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
      "capping_budget": {
        "duration": "day",
        "amount": 100
      },
      "capping_conversions": {
        "duration": "day",
        "amount": 50
      },
      "callback_url": "https://affiliate.com/postback",
      "offer_url": "https://pulpy.com/click?offer_id=10&publisher_id=7",
      "status": "active",
      "assigned_at": "2024-01-01T00:00:00.000Z",
      "publisher_email": "publisher@example.com",
      "publisher_company": "Example Media",
      "offer_name": "Premium Offer",
      "offer_category": "SaaS"
    }
  ]
}
```

---

#### 3. Get Assignment by ID

**Endpoint:** `GET /api/admin/assignments/:id`

**Authentication:** Required (Basic Auth)

**Path Parameters:**
- `id` (integer, required): Assignment ID

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "publisher_id": 7,
    "offer_id": 10,
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
    "callback_url": "https://affiliate.com/postback",
    "offer_url": "https://pulpy.com/click?offer_id=10&publisher_id=7",
    "status": "active",
    "assigned_at": "2024-01-01T00:00:00.000Z",
    "publisher_email": "publisher@example.com",
    "publisher_company": "Example Media",
    "offer_name": "Premium Offer",
    "offer_category": "SaaS"
  }
}
```

---

#### 4. Get Tracking URL

**Endpoint:** `GET /api/admin/assignments/:id/tracking-url`

**Authentication:** Required (Basic Auth)

**Path Parameters:**
- `id` (integer, required): Assignment ID

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "tracking_url": "http://localhost:3000/click?offer_id=10&publisher_id=7&tid={TID}"
  }
}
```

---

#### 5. Delete Assignment

**Endpoint:** `DELETE /api/admin/assignments/:id`

**Authentication:** Required (Basic Auth)

**Path Parameters:**
- `id` (integer, required): Assignment ID

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Assignment deleted successfully"
}
```

---

### Test Conversion

#### Test Conversion

**Endpoint:** `POST /api/admin/test-conversion`

**Authentication:** Required (Basic Auth)

**Request Body:**
```json
{
  "affiliate_url": "http://localhost:3000/click?offer_id=1&pub_id=1&tid=test123",
  "click_id": "optional-existing-click-uuid"
}
```

**Request Schema:**
- `affiliate_url` (string, required): Tracking URL containing `offer_id` and `pub_id` parameters
- `click_id` (string, optional): Existing click UUID (if not provided, a new click is created)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Test conversion processed",
  "data": {
    "click_id": "550e8400-e29b-41d4-a716-446655440000",
    "offer_id": "1",
    "publisher_id": "1"
  }
}
```

---

## Tracking APIs

Base Path: `/` (Public, no authentication)

### Click Tracking

**Endpoint:** `GET /click`

**Authentication:** Not required (Public)

**Query Parameters:**
- `offer_id` (integer, required): Offer ID
- `pub_id` (integer, required): Publisher ID
- `tid` (string, optional): Tracking ID
- `rcid` (string, optional): Revenue Click ID
- `source_id` (string, optional): Source identifier
- `device_id` (string, optional): Device identifier
- `google_id` (string, optional): Google ID
- `android_id` (string, optional): Android ID

**Description:**
Tracks a click event. The system:
1. Validates offer and publisher exist and are active
2. Checks assignment exists and is active
3. Checks assignment-level budget cap (if set)
4. Checks assignment-level conversion cap (if set)
5. Checks offer-level caps
6. Records click with device/location data
7. Redirects to `assignment.offer_url` (if set) or `offer.offer_url`
8. Replaces macros in URL: `{TID}`, `{RCID}`, `{CLICK_ID}`

**Response:**
- `302 Redirect`: Redirects to offer URL with click parameters appended
- `400 Bad Request`: Error JSON if validation fails

**Example:**
```bash
curl -L "http://localhost:3000/click?offer_id=1&pub_id=1&tid=test123&rcid=rcid123"
```

---

### Impression Tracking

**Endpoint:** `GET /imp`

**Authentication:** Not required (Public)

**Query Parameters:**
- `offer_id` (integer, required): Offer ID
- `pub_id` (integer, required): Publisher ID

**Description:**
Tracks an impression (view) event. Records impression data and returns a 1x1 transparent pixel.

**Response:**
- `200 OK`: Returns 1x1 transparent GIF pixel
- `400 Bad Request`: Error JSON if validation fails

**Example:**
```bash
curl "http://localhost:3000/imp?offer_id=1&pub_id=1"
```

---

## Postback APIs

Base Path: `/` (Public, no authentication)

### Process Postback (GET)

**Endpoint:** `GET /postback`

**Authentication:** Not required (Public)

**Query Parameters:**
- `click_id` (string, optional): Click UUID (required if `rcid` not provided)
- `rcid` (string, optional): Revenue Click ID (required if `click_id` not provided)
- `amount` (number, optional): Conversion amount (defaults to payout)
- `status` (string, optional): Conversion status (default: `approved`)

**Description:**
Processes a conversion postback. The system:
1. Finds click by `click_id` or `rcid`
2. Deduplicates by `rcid + offer_id`
3. Gets assignment data
4. Checks assignment-level budget cap
5. Checks assignment-level conversion cap
6. Checks offer-level caps
7. Determines conversion status (auto-approval if `conversion_approval_percentage` set)
8. Records conversion
9. Updates daily stats
10. Sends postback to `assignment.callback_url` (async, fire-and-forget)

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Conversion recorded successfully",
  "duplicate": false,
  "data": {
    "id": 1,
    "conversion_uuid": "550e8400-e29b-41d4-a716-446655440000",
    "click_uuid": "click-uuid-here",
    "offer_id": 1,
    "publisher_id": 1,
    "rcid": "rcid123",
    "status": "approved",
    "amount": 10.00,
    "payout": 5.00,
    "timestamp": "2024-01-01T00:00:00.000Z"
  },
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

**Duplicate Response:**
```json
{
  "success": true,
  "message": "Conversion already exists (deduplicated)",
  "duplicate": true,
  "data": {
    "id": 1,
    "conversion_uuid": "existing-uuid",
    ...
  }
}
```

**Example:**
```bash
curl "http://localhost:3000/postback?click_id=click-uuid&rcid=rcid123&amount=10.00&status=approved"
```

---

### Process Postback (POST)

**Endpoint:** `POST /postback`

**Authentication:** Not required (Public)

**Request Body:**
```json
{
  "click_id": "click-uuid",
  "rcid": "rcid123",
  "amount": 10.00,
  "status": "approved"
}
```

**Response:** Same as GET `/postback`

**Example:**
```bash
curl -X POST http://localhost:3000/postback \
  -H "Content-Type: application/json" \
  -d '{
    "click_id": "click-uuid",
    "rcid": "rcid123",
    "amount": 10.00,
    "status": "approved"
  }'
```

---

## Reporting APIs

Base Path: `/api/admin/reports`

**Authentication:** Required (Basic Auth)

### Dashboard Stats

**Endpoint:** `GET /api/admin/reports/dashboard`

**Description:**
Returns overall dashboard statistics including impressions, clicks, conversions, revenue, and counts of offers/publishers.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "impressions": {
      "total": 10000
    },
    "clicks": {
      "total": 5000,
      "unique": 4500
    },
    "conversions": {
      "total": 500,
      "approved": 450,
      "conversion_rate": 10.00
    },
    "revenue": {
      "total": 5000.00,
      "payout": 2500.00,
      "profit": 2500.00
    },
    "offers": {
      "total": 50,
      "active": 30
    },
    "publishers": {
      "total": 100,
      "active": 80,
      "pending": 10
    }
  }
}
```

---

### Summary Report

**Endpoint:** `GET /api/admin/reports/summary`

**Query Parameters:**
- `date_from` (date, optional): Start date (YYYY-MM-DD)
- `date_to` (date, optional): End date (YYYY-MM-DD)
- `offer_id` (integer, optional): Filter by offer ID
- `publisher_id` (integer, optional): Filter by publisher ID
- `country` (string, optional): Filter by country
- `ip` (string, optional): Filter by IP address
- `tid` (string, optional): Filter by tracking ID
- `rcid` (string, optional): Filter by revenue click ID
- `device_brand` (string, optional): Filter by device brand
- `os` (string, optional): Filter by OS
- `browser` (string, optional): Filter by browser
- `referrer` (string, optional): Filter by referrer (LIKE search)
- `source_id` (string, optional): Filter by source ID
- `google_id` (string, optional): Filter by Google ID
- `android_id` (string, optional): Filter by Android ID
- `hour` (integer, optional): Filter by hour (0-23)

**Description:**
Returns aggregated summary statistics based on filters.

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "affiliates": 10,
    "unique_clicks": 1000,
    "impressions": 2000,
    "conversions": 100,
    "revenue": 1000.00,
    "payout": 500.00,
    "profit": 500.00,
    "conversion_rate": 10.00
  }
}
```

---

### Detailed Report

**Endpoint:** `GET /api/admin/reports/detailed`

**Query Parameters:**
- All filters from Summary Report, plus:
- `page` (integer, optional): Page number (default: 1)
- `limit` (integer, optional): Items per page (default: 50)

**Description:**
Returns detailed click/conversion data with pagination.

**Response (200 OK):**
```json
{
  "success": true,
  "data": [
    {
      "click_id": 1,
      "click_uuid": "click-uuid",
      "offer_id": 1,
      "offer_name": "Premium Offer",
      "publisher_id": 1,
      "publisher_email": "publisher@example.com",
      "publisher_company": "Example Media",
      "ip": "192.168.1.1",
      "country": "US",
      "device_type": "mobile",
      "browser": "Chrome",
      "os": "Android",
      "rcid": "rcid123",
      "tid": "tid123",
      "click_timestamp": "2024-01-01T00:00:00.000Z",
      "conversion_id": 1,
      "conversion_uuid": "conv-uuid",
      "conversion_status": "approved",
      "conversion_amount": 10.00,
      "conversion_payout": 5.00,
      "conversion_timestamp": "2024-01-01T01:00:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "totalPages": 2
  }
}
```

---

### Publisher Conversion Statistics

**Endpoint:** `GET /api/admin/reports/publisher-conversions`

**Description:**
Returns conversion statistics grouped by publisher and offer. Shows how many conversions each publisher has done for each offer they're linked to.

**Query Parameters:**
- `publisher_id` (integer, optional): Filter by specific publisher ID
- `offer_id` (integer, optional): Filter by specific offer ID
- `date_from` (date, optional): Start date (YYYY-MM-DD)
- `date_to` (date, optional): End date (YYYY-MM-DD)

**Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "stats": [
      {
        "publisher": {
          "id": 1,
          "email": "publisher@example.com",
          "company_name": "Example Media",
          "country": "US"
        },
        "offer": {
          "id": 10,
          "name": "Premium Subscription Offer",
          "category": "SaaS"
        },
        "clicks": {
          "total": 1000
        },
        "conversions": {
          "total": 100,
          "approved": 90,
          "pending": 5,
          "rejected": 3,
          "rejected_cap": 2,
          "conversion_rate": 10.00,
          "approval_rate": 90.00
        },
        "revenue": {
          "total": 1000.00,
          "approved": 900.00
        },
        "payout": {
          "total": 500.00,
          "approved": 450.00
        },
        "profit": {
          "total": 500.00,
          "approved": 450.00
        }
      },
      {
        "publisher": {
          "id": 1,
          "email": "publisher@example.com",
          "company_name": "Example Media",
          "country": "US"
        },
        "offer": {
          "id": 15,
          "name": "Another Offer",
          "category": "E-commerce"
        },
        "clicks": {
          "total": 500
        },
        "conversions": {
          "total": 50,
          "approved": 45,
          "pending": 3,
          "rejected": 2,
          "rejected_cap": 0,
          "conversion_rate": 10.00,
          "approval_rate": 90.00
        },
        "revenue": {
          "total": 500.00,
          "approved": 450.00
        },
        "payout": {
          "total": 250.00,
          "approved": 225.00
        },
        "profit": {
          "total": 250.00,
          "approved": 225.00
        }
      }
    ],
    "summary": {
      "total_publishers": 1,
      "total_offers": 2,
      "total_combinations": 2
    }
  }
}
```

**Example Usage:**

Get all conversions for a specific publisher:
```bash
curl -H "Authorization: Basic $(echo -n 'admin@bng.com:admin123' | base64)" \
  "http://localhost:3000/api/admin/reports/publisher-conversions?publisher_id=1"
```

Get conversions for a specific offer:
```bash
curl -H "Authorization: Basic $(echo -n 'admin@bng.com:admin123' | base64)" \
  "http://localhost:3000/api/admin/reports/publisher-conversions?offer_id=10"
```

Get conversions within a date range:
```bash
curl -H "Authorization: Basic $(echo -n 'admin@bng.com:admin123' | base64)" \
  "http://localhost:3000/api/admin/reports/publisher-conversions?date_from=2024-01-01&date_to=2024-01-31"
```

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
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_publishers_status (status),
  KEY idx_publishers_email (email)
);
```

### Offers Table

```sql
CREATE TABLE offers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  advertiser_id INT NOT NULL,
  name VARCHAR(150) NOT NULL,
  description TEXT,
  category VARCHAR(100),
  status ENUM('live','paused','draft') DEFAULT 'draft',
  offer_currency VARCHAR(10) NOT NULL,
  country VARCHAR(100) NOT NULL,
  advertiser_model VARCHAR(50) NOT NULL,
  advertiser_amount DECIMAL(10,2) NOT NULL,
  affiliate_model VARCHAR(50) NOT NULL,
  affiliate_amount DECIMAL(10,2) NOT NULL,
  offer_url VARCHAR(500) NOT NULL,
  preview_url VARCHAR(500),
  capping_type ENUM('none','daily','monthly','weekly') DEFAULT 'none',
  daily_cap INT,
  monthly_cap INT,
  total_cap INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_offers_advertiser FOREIGN KEY (advertiser_id) REFERENCES advertisers(id)
);
```

### Publisher Offers (Assignments) Table

```sql
CREATE TABLE publisher_offers (
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
  CONSTRAINT fk_po_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE
);
```

### Clicks Table

```sql
CREATE TABLE clicks (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  click_uuid CHAR(36) NOT NULL DEFAULT (UUID()),
  offer_id INT NOT NULL,
  publisher_id INT NOT NULL,
  publisher_offer_id INT,
  ip VARCHAR(45),
  user_agent TEXT,
  referrer TEXT,
  country VARCHAR(100),
  device_type VARCHAR(50),
  browser VARCHAR(100),
  os VARCHAR(100),
  rcid VARCHAR(255),
  tid VARCHAR(255),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_click_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
  CONSTRAINT fk_click_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE CASCADE
);
```

### Conversions Table

```sql
CREATE TABLE conversions (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  conversion_uuid CHAR(36) NOT NULL DEFAULT (UUID()),
  click_uuid CHAR(36),
  offer_id INT NOT NULL,
  publisher_id INT NOT NULL,
  publisher_offer_id INT,
  rcid VARCHAR(255) NOT NULL,
  status ENUM('pending','approved','rejected','rejected_cap') DEFAULT 'pending',
  amount DECIMAL(10,2) NOT NULL,
  payout DECIMAL(10,2) NOT NULL,
  ip VARCHAR(45),
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  postback_payload JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_rcid_offer (rcid, offer_id),
  CONSTRAINT fk_conv_offer FOREIGN KEY (offer_id) REFERENCES offers(id) ON DELETE CASCADE,
  CONSTRAINT fk_conv_publisher FOREIGN KEY (publisher_id) REFERENCES publishers(id) ON DELETE CASCADE
);
```

---

## Error Responses

All error responses follow this format:

```json
{
  "success": false,
  "error": "Error Type",
  "message": "Human-readable error message",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Common HTTP Status Codes

- `200 OK`: Success
- `201 Created`: Resource created successfully
- `400 Bad Request`: Validation error or bad request
- `401 Unauthorized`: Authentication required or invalid
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource already exists (e.g., duplicate email)
- `500 Internal Server Error`: Server error

### Validation Errors

When validation fails, the response includes a `details` array:

```json
{
  "success": false,
  "error": "Validation Error",
  "message": "Request validation failed",
  "details": [
    {
      "field": "email",
      "message": "\"email\" must be a valid email"
    },
    {
      "field": "password",
      "message": "\"password\" length must be at least 6 characters long"
    }
  ]
}
```

---

## URL Macros

### Assignment Offer URL Macros

When using `assignment.offer_url`, the following macros are replaced:

- `{TID}` → Tracking ID from query parameter
- `{RCID}` → Revenue Click ID from query parameter
- `{CLICK_ID}` → Generated click UUID

### Publisher Callback URL Macros

When sending postback to `assignment.callback_url`, the following macros are replaced:

- `{click_id}` / `{CLICK_ID}` → Click UUID
- `{conversion_id}` / `{CONVERSION_ID}` → Conversion UUID
- `{rcid}` / `{RCID}` → Revenue Click ID
- `{payout}` / `{PAYOUT}` → Payout amount
- `{amount}` / `{AMOUNT}` → Conversion amount
- `{status}` / `{STATUS}` → Conversion status (`approved`, `pending`, `rejected`, etc.)

---

## Capping Logic

### Capping Priority Order

1. **Assignment Budget Cap** (if set) → Hard reject if exceeded
2. **Assignment Conversion Cap** (if set) → Hard reject if exceeded
3. **Offer Total Cap** (if set) → Apply cap action if exceeded
4. **Offer Capping Type Cap** (daily/weekly/monthly) → Apply cap action if exceeded

### Assignment-Level Capping

- **Budget Cap**: Checks total revenue (sum of conversion amounts) within duration
- **Conversion Cap**: Checks total conversion count within duration
- **Duration Options**: `hour`, `day`, `week`, `month`

### Conversion Approval Percentage

If `conversion_approval_percentage` is set (0-100):
- Randomly approves that percentage of conversions
- Others are set to `pending`
- Example: If set to 50%, approximately 50% of conversions will be auto-approved

---

## Health Check

**Endpoint:** `GET /health`

**Authentication:** Not required

**Response (200 OK):**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

## Notes

1. **Date Formats**: All dates should be in ISO 8601 format (YYYY-MM-DD) or full timestamp
2. **Currency**: All monetary values are in decimal format (e.g., `10.50`)
3. **UUIDs**: Click and conversion UUIDs are generated automatically
4. **Deduplication**: Conversions are deduplicated by `rcid + offer_id` combination
5. **Postback Failures**: Postback failures to publisher callback URLs do NOT fail the conversion. They are logged but the conversion is still recorded.
6. **Auto-Generated URLs**: If `offer_url` or `callback_url` are not provided in assignments, they are auto-generated using environment variables and publisher settings.

---

## Environment Variables

Required environment variables:

- `PORT`: Server port (default: 5000)
- `HOST`: Server host (default: 0.0.0.0)
- `BASE_URL`: Base URL for generating tracking URLs
- `TRACKING_BASE_URL`: Alternative base URL for tracking (falls back to BASE_URL)
- Database connection variables (DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, etc.)

---

**Last Updated:** 2024-01-01
**API Version:** 1.0.0
