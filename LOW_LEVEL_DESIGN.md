# Comprehensive Low-Level Design: Pulpy Reporting Portal

## Table of Contents
1. [System Architecture](#system-architecture)
2. [Database Design](#database-design)
3. [API Design](#api-design)
4. [Service Layer Design](#service-layer-design)
5. [Controller Layer Design](#controller-layer-design)
6. [Validation & Schema Design](#validation--schema-design)
7. [Business Logic Implementation](#business-logic-implementation)
8. [Data Flow & Relationships](#data-flow--relationships)
9. [Security & Authentication](#security--authentication)
10. [Performance Considerations](#performance-considerations)

## System Architecture

### Overall Architecture Pattern
**Architecture**: Layered Architecture with MVC-inspired separation
- **Presentation Layer**: Controllers handling HTTP requests/responses
- **Business Logic Layer**: Services containing domain logic
- **Data Access Layer**: Direct MySQL queries with connection pooling
- **Infrastructure Layer**: Utilities, validators, and external integrations

### Technology Stack Rationale
- **Node.js**: Event-driven, non-blocking I/O ideal for high-concurrency affiliate tracking
- **Fastify**: High-performance web framework with built-in validation and routing
- **MySQL**: ACID compliance for financial data integrity in affiliate payouts
- **Connection Pooling**: Handles multiple concurrent tracking requests efficiently

### Directory Structure Design
```
src/
├── controllers/    # HTTP request handlers - thin layer, delegate to services
├── services/       # Business logic - core domain operations
├── db/            # Database layer - migrations and connection management
├── routes/        # Route definitions - API endpoint configuration
├── schemas/       # Validation schemas - input/output validation rules
├── middleware/    # Cross-cutting concerns - auth, logging, error handling
├── utils/         # Shared utilities - device parsing, URL generation
├── validators/    # Legacy validation (being migrated to schemas)
└── tests/         # Test suites
```

## Database Design

### Database Schema Overview

#### Core Entities & Relationships
```
Advertisers (1) ──── (N) Offers (N) ──── (N) Publisher_Offers (N) ──── (1) Publishers
                        │                    │
                        ├─ (N) Clicks ──────┘
                        ├─ (N) Impressions
                        └─ (N) Conversions
```

### Table-by-Table Design Analysis

#### 1. `admin_users` Table
```sql
CREATE TABLE admin_users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**Design Rationale**:
- **Single Admin Table**: Simplicity - one admin system, no complex role hierarchies needed
- **Email Unique Constraint**: Prevents duplicate admin accounts
- **Password Hash Storage**: Security - never store plain passwords
- **Role Field**: Future extensibility for different admin permission levels
- **Timestamps**: Audit trail for admin account management

**Why VARCHAR(255)**: Standard length for emails, allows international domains
**Why NOT ENUM for role**: Flexibility to add new roles without schema changes

#### 2. `advertisers` Table
```sql
CREATE TABLE advertisers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  company_name VARCHAR(150),
  country VARCHAR(100),
  website VARCHAR(255),
  notes TEXT,
  status ENUM('active','inactive') DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

**Design Rationale**:
- **Status ENUM**: Only two states possible, prevents invalid status values
- **Company Name Optional**: B2B vs individual advertisers
- **Website Field**: For verification and affiliate program legitimacy
- **Notes TEXT**: Flexible field for internal comments about advertiser

**Why ENUM for status**: Binary state, no need for VARCHAR flexibility here

#### 3. `publishers` Table (Affiliates)
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

**Design Rationale**:
- **Password Hash Nullable**: Some affiliates might use SSO or API-only access
- **Global Postback URL**: Default conversion notification endpoint
- **Status ENUM with 3 states**: Publisher lifecycle management
- **Indexes**: Performance for common queries (status filtering, email lookups)

**Why TEXT for postback_url**: URLs can be very long, especially with parameters
**Why separate first_name and company_name**: Supports both individual and business affiliates

#### 4. `offers` Table - The Heart of the System

**Core Offer Information**:
```sql
name VARCHAR(150) NOT NULL,           -- Human-readable offer title
description TEXT,                     -- Detailed offer description
category VARCHAR(100),                -- Classification (CPA, CPI, CPM)
status ENUM('live','paused','draft') DEFAULT 'draft',  -- Publishing state
offer_visibility VARCHAR(50) NULL,    -- Access control (public/private/restricted)
```

**Why VARCHAR for visibility**: Unlike status (fixed workflow states), visibility can have custom values per business needs

**Financial Model**:
```sql
offer_currency VARCHAR(10) NOT NULL,    -- USD, EUR, etc.
country VARCHAR(100) NOT NULL,          -- Geographic targeting

advertiser_model VARCHAR(50) NOT NULL,  -- CPA, CPL, CPS, etc.
advertiser_amount DECIMAL(10,2) NOT NULL,
affiliate_model VARCHAR(50) NOT NULL,   -- Revenue sharing model
affiliate_amount DECIMAL(10,2) NOT NULL,
```

**Why separate advertiser/affiliate models**: Different pricing models for buyer vs seller sides

**Offer Assets**:
```sql
offer_url VARCHAR(500) NOT NULL,        -- Primary landing page
preview_url VARCHAR(500),               -- Preview for affiliates
token_type VARCHAR(100),                -- URL parameter format
macros_json JSON,                       -- Token replacement mappings
```

**Why JSON for macros**: Flexible key-value storage for URL tokenization

**Time Targeting**:
```sql
start_date DATE, end_date DATE,         -- Date range restrictions
start_time TIME, end_time TIME,         -- Time-of-day restrictions
```

**Why separate DATE and TIME**: Allows flexible scheduling (date-only, time-only, or both)

**Traffic Targeting**:
```sql
ip_action VARCHAR(20),                  -- ALLOW/BLOCK for IP targeting
ip_list TEXT,                           -- Comma-separated IP ranges

device_targeting_json JSON,             -- Device type restrictions
device_action VARCHAR(20),              -- ALLOW/BLOCK logic for devices
os_targeting_json JSON,                 -- OS version restrictions
os_action VARCHAR(20),                  -- ALLOW/BLOCK logic for OS
browser_targeting_json JSON,            -- Browser restrictions
browser_action VARCHAR(20),             -- ALLOW/BLOCK logic for browsers

isp_targeting_json JSON,                -- ISP-based targeting
carrier_targeting_json JSON,            -- Mobile carrier targeting
city_targeting_json JSON,               -- Geographic city targeting
```

**Why separate JSON and action fields**: JSON defines the list, action defines allowlist/blocklist logic

**Capping System**:
```sql
capping_type ENUM('none','daily','monthly','weekly') DEFAULT 'none',
daily_cap INT, monthly_cap INT, total_cap INT,
conversion_cap INT,
capping_conversions_duration VARCHAR(20),  -- daily/weekly/monthly for conversions
budget_cap DECIMAL(10,2),
cap_action VARCHAR(50),                    -- What to do when capped (pause/fallback/reject/alert)

-- Advertiser-level capping (separate from offer-level)
advertiser_capping_budget_duration VARCHAR(20),
advertiser_capping_budget_amount DECIMAL(10,2),
advertiser_over_capping VARCHAR(50),      -- Advertiser-specific over-cap action

-- Affiliate-level capping per assignment
affiliate_over_capping VARCHAR(50),       -- Affiliate-specific over-cap action
```

**Why ENUM for capping_type**: Fixed set of time periods, prevents typos
**Why VARCHAR for over_capping actions**: Flexible business rules (pause, fallback, reject, alert, etc.)

**Fallback System**:
```sql
fallback_enabled TINYINT(1) DEFAULT 0,
fallback_url VARCHAR(500),
fallback_offer_id INT,
```

**Why TINYINT(1)**: Boolean flag, more efficient than VARCHAR for true/false

**Postback Configuration**:
```sql
advertiser_postback_url VARCHAR(500),
advertiser_postback_method VARCHAR(10),    -- GET/POST
advertiser_postback_macros_json JSON,     -- Token mappings for advertiser notifications

system_postback_url VARCHAR(500),
system_postback_method VARCHAR(10),        -- GET/POST
system_postback_macros_json JSON,         -- Token mappings for internal notifications
```

**Why separate advertiser/system postbacks**: Different notification needs and security contexts

#### 5. `publisher_offers` Table (Assignments)

**Core Assignment**:
```sql
publisher_id INT NOT NULL,
offer_id INT NOT NULL,
status ENUM('active','inactive','suspended') DEFAULT 'active',
assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
UNIQUE KEY uniq_publisher_offer (publisher_id, offer_id),
```

**Why composite unique key**: One assignment per publisher-offer pair

**Override System**:
```sql
payout_override DECIMAL(10,2),                    -- Custom payout for this assignment
cap_override INT,                                -- Custom cap for this assignment
conversion_approval_percentage DECIMAL(5,2),      -- Auto-approval threshold
```

**Assignment-Level Capping**:
```sql
capping_budget_duration VARCHAR(20),              -- daily/weekly/monthly
capping_budget_amount DECIMAL(10,2),              -- Budget limit for this assignment
capping_conversions_duration VARCHAR(20),         -- daily/weekly/monthly
capping_conversions_amount INT,                   -- Conversion limit for this assignment
```

**Custom URLs**:
```sql
callback_url TEXT,                               -- Publisher-specific postback
offer_url TEXT,                                  -- Publisher-specific landing page
```

**Why TEXT for URLs**: Publisher URLs may include long query parameters

#### 6. `clicks` Table - Core Tracking

**Core Tracking Data**:
```sql
click_uuid CHAR(36) NOT NULL DEFAULT (UUID()),   -- Unique click identifier
offer_id INT NOT NULL,
publisher_id INT NOT NULL,
publisher_offer_id INT,                          -- Assignment reference

ip VARCHAR(45),                                  -- IPv4/IPv6 support
user_agent TEXT,                                 -- Full browser fingerprint
referrer TEXT,                                   -- Traffic source
country VARCHAR(100), region VARCHAR(100), city VARCHAR(100),
isp VARCHAR(255),
location JSON,                                   -- Detailed geo data
domain VARCHAR(255),                             -- Extracted domain from referrer
```

**Device Information**:
```sql
device_type VARCHAR(50),                         -- Mobile/Desktop/Tablet
browser VARCHAR(100), os VARCHAR(100), os_version VARCHAR(50),
device_brand VARCHAR(100), device_model VARCHAR(100),
```

**Tracking Parameters**:
```sql
source_id VARCHAR(255), device_id VARCHAR(255),
google_id VARCHAR(255), android_id VARCHAR(255),
rcid VARCHAR(255), tid VARCHAR(255),            -- Conversion tracking IDs
timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,  -- Click timestamp
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- Database insertion time
```

**Why separate timestamp and created_at**: Business timestamp vs system timestamp
**Why CHAR(36) for UUID**: Fixed length for UUID v4 format

#### 7. `impressions` Table

**Simplified Tracking** (no conversion tracking needed):
```sql
imp_uuid CHAR(36) NOT NULL DEFAULT (UUID()),
offer_id INT NOT NULL,
publisher_id INT NOT NULL,
ip VARCHAR(45),
user_agent TEXT,
referrer TEXT,
timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
```

**Why fewer fields than clicks**: Impression tracking is simpler, no attribution needed

#### 8. `conversions` Table

**Core Conversion Data**:
```sql
conversion_uuid CHAR(36) NOT NULL DEFAULT (UUID()),
click_uuid CHAR(36),                             -- Links to original click
offer_id INT NOT NULL,
publisher_id INT NOT NULL,
publisher_offer_id INT,
rcid VARCHAR(255) NOT NULL,                      -- Unique conversion identifier
status ENUM('pending','approved','rejected','rejected_cap') DEFAULT 'pending',
amount DECIMAL(10,2) NOT NULL,                   -- Revenue amount
payout DECIMAL(10,2) NOT NULL,                   -- Publisher payout
```

**Why rcid unique per offer**: Prevents duplicate conversions for same transaction
**Why 4 status states**: Complete conversion lifecycle

#### 9. `daily_offer_stats` Table

**Aggregated Reporting Data**:
```sql
offer_id INT NOT NULL,
day DATE NOT NULL,
impressions INT DEFAULT 0,
clicks INT DEFAULT 0,
unique_clicks INT DEFAULT 0,                    -- Unique publishers
conversions INT DEFAULT 0,
revenue DECIMAL(10,2) DEFAULT 0,
payout DECIMAL(10,2) DEFAULT 0,
profit DECIMAL(10,2) DEFAULT 0,
UNIQUE KEY uniq_offer_day (offer_id, day),
```

**Why unique constraint**: One record per offer per day
**Why separate clicks and unique_clicks**: Total clicks vs unique publisher clicks

## API Design

### API Architecture Principles

#### RESTful Design
- **Resource-based URLs**: `/api/offers`, `/api/publishers`
- **HTTP Methods**: GET (read), POST (create), PATCH (update), DELETE (remove)
- **Status Codes**: 200 (success), 201 (created), 400 (bad request), 404 (not found), 500 (server error)

#### Public vs Admin APIs
- **Admin APIs**: `/api/admin/*` - Full CRUD operations, require authentication
- **Public APIs**: `/click`, `/imp`, `/postback` - Tracking endpoints, no auth required

### Detailed API Endpoint Analysis

#### Admin Offer Management

**POST /api/admin/offers**
- **Purpose**: Create new affiliate offers
- **Why**: Central offer creation in affiliate network management
- **Validation**: Full offer schema validation
- **Response**: Created offer with generated ID
- **Business Logic**: Validates advertiser exists, sets default status

**GET /api/admin/offers**
- **Purpose**: List offers with filtering and pagination
- **Why**: Admin needs to browse and manage all offers
- **Query Params**: status, advertiser_id, category, offer_visibility, search, page, limit
- **Response**: Paginated list with metadata
- **Performance**: Indexed queries for filtering

**GET /api/admin/offers/:id**
- **Purpose**: Get detailed offer information
- **Why**: Admin needs full offer context for management
- **Response**: Offer + advertiser details + assignments + statistics + recent activity
- **Business Logic**: Aggregates data from multiple tables

**PATCH /api/admin/offers/:id**
- **Purpose**: Update offer properties
- **Why**: Offers evolve over time (pricing, targeting, status changes)
- **Validation**: Partial schema validation (only provided fields)
- **Business Logic**: Preserves existing values for omitted fields

**PATCH /api/admin/offers/:id/status**
- **Purpose**: Change offer publishing status
- **Why**: Workflow control (draft → live → paused)
- **Validation**: Strict enum validation
- **Business Logic**: Atomic status updates

#### Publisher Management

**POST /api/admin/publishers**
- **Purpose**: Register new affiliates
- **Why**: Grow affiliate network
- **Business Logic**: Generates secure password hashes

**GET /api/admin/publishers**
- **Purpose**: List all affiliates
- **Why**: Network management and oversight
- **Response**: Includes assignment counts and status

**GET /api/admin/publishers/:id**
- **Purpose**: Detailed affiliate profile
- **Why**: Performance analysis and relationship management
- **Response**: Publisher + all assignments + statistics

#### Assignment Management

**POST /api/admin/assignments**
- **Purpose**: Assign offers to publishers
- **Why**: Core affiliate network operation
- **Business Logic**: Prevents duplicate assignments

**PATCH /api/admin/assignments/:id**
- **Purpose**: Modify assignment terms
- **Why**: Custom pricing and caps per affiliate
- **Business Logic**: Updates override values

#### Tracking Endpoints (Public)

**GET /click**
- **Purpose**: Track affiliate clicks and redirect
- **Why**: Core attribution and traffic routing
- **Params**: offer_id, pub_id, tid, rcid, source_id, etc.
- **Business Logic**:
  1. Validate offer and publisher
  2. Check assignment status
  3. Apply capping logic (offer → assignment level)
  4. Apply targeting rules
  5. Log click with device fingerprinting
  6. Redirect to offer URL with macro replacement

**GET /imp**
- **Purpose**: Track impressions
- **Why**: Performance measurement for display campaigns
- **Business Logic**: Simplified logging (no attribution needed)

**GET/POST /postback**
- **Purpose**: Record conversions from advertiser systems
- **Why**: Revenue attribution and payout calculation
- **Security**: Validates against click data to prevent fraud
- **Business Logic**:
  1. Deduplication by rcid + offer_id
  2. Link to original click
  3. Apply approval logic and overrides
  4. Update statistics

#### Reporting Endpoints

**GET /api/admin/reports/dashboard**
- **Purpose**: High-level business metrics
- **Why**: Executive oversight of affiliate network performance
- **Response**: Aggregated totals across all offers and publishers

**GET /api/admin/reports/summary**
- **Purpose**: Filtered performance data
- **Why**: Operational analysis with flexible date/entity filtering
- **Business Logic**: Joins clicks, impressions, conversions with time-based aggregation

**GET /api/admin/reports/detailed**
- **Purpose**: Raw event-level data
- **Why**: Forensic analysis and debugging
- **Performance**: Paginated to handle large datasets

## Service Layer Design

### Service Architecture Pattern

#### Data Access Pattern
```javascript
class OfferService {
  // Repository-like methods
  async findById(id) { /* SELECT * FROM offers WHERE id = ? */ }
  async findAll(filters) { /* Complex filtering logic */ }
  async create(data) { /* INSERT with validation */ }
  async update(id, data) { /* UPDATE with partial updates */ }

  // Business logic methods
  async getOfferByIdWithDetails(id) { /* Aggregate multiple queries */ }
  async changeStatus(id, status) { /* Status transition logic */ }
}
```

**Why this pattern**: Separates data access from business logic, enables testing

#### Transaction Management
- **Explicit Transactions**: Used for multi-table operations
- **Connection Pooling**: Automatic connection management
- **Error Handling**: Rollback on failures

### Service Method Analysis

#### OfferService.createOffer(data)
**Purpose**: Create new offers with full validation
**Why separate method**: Complex validation and data transformation
**Business Logic**:
1. Validate advertiser exists
2. Transform JSON fields to strings
3. Handle nullable fields properly
4. Return created offer with ID

#### OfferService.updateOffer(id, data)
**Purpose**: Partial updates to existing offers
**Why**: Offers change frequently, not all fields need updating
**Business Logic**:
1. Build dynamic UPDATE query
2. Only update provided fields
3. Preserve existing values for omitted fields
4. Handle JSON field serialization

#### TrackingService.trackClick(query, request)
**Purpose**: Core click tracking and attribution
**Why complex**: Multi-step validation and business rules
**Business Logic Flow**:
1. **Input Validation**: Parse and validate required parameters
2. **Entity Validation**: Verify offer and publisher exist and are active
3. **Assignment Lookup**: Find active assignment between offer and publisher
4. **Capping Checks**: Multi-level capping (offer → advertiser → affiliate)
5. **Targeting Evaluation**: Apply device, OS, browser, geo targeting rules
6. **Device Fingerprinting**: Parse user agent for detailed device info
7. **Click Logging**: Store comprehensive click data
8. **URL Generation**: Apply macro replacement and redirect

**Why multi-level capping**: Different stakeholders have different limits
**Why comprehensive logging**: Attribution requires detailed forensic data

## Validation & Schema Design

### Schema Architecture

#### JSON Schema for Validation
```javascript
export const createOfferSchema = {
  type: 'object',
  additionalProperties: false,  // Prevents extra fields
  required: ['advertiser_id', 'name', /* ... */],
  properties: {
    advertiser_id: { type: 'integer', minimum: 1 },
    name: { type: 'string', minLength: 2, maxLength: 150 },
    // ...
  }
};
```

**Why JSON Schema**:
- **Standardized**: Industry standard for API validation
- **Comprehensive**: Supports complex validation rules
- **Reusable**: Same schema for input validation and documentation
- **Type Safety**: Catches type mismatches early

#### Schema Organization
- **createOfferSchema**: Full validation for offer creation
- **updateOfferSchema**: Partial validation (minProperties: 1)
- **listOffersQuerySchema**: Query parameter validation
- **changeOfferStatusSchema**: Strict enum validation

### Field Validation Rationale

#### String Length Limits
```javascript
name: { type: 'string', minLength: 2, maxLength: 150 },
description: { type: ['string', 'null'] },  // No length limit for flexibility
category: { type: ['string', 'null'], maxLength: 100 },
```

**Why different limits**: Names need branding space, descriptions need flexibility

#### Numeric Validation
```javascript
advertiser_amount: { type: 'number' },  // Any positive number
budget_cap: { type: ['number', 'null'], minimum: 0 },
```

**Why number not integer for amounts**: Supports decimal currencies

#### Enum vs Free Text
```javascript
status: { type: 'string', enum: ['live', 'paused', 'draft'] },  // Fixed workflow
cap_action: { type: ['string', 'null'], maxLength: 50 },       // Flexible business rules
```

**Why enum for status**: Strict workflow control
**Why free text for actions**: Business rules evolve (pause, fallback, reject, alert, etc.)

#### Nullable Fields Strategy
```javascript
start_date: { type: ['string', 'null'], format: 'date' },  // Optional date
ip_list: { type: ['string', 'null'] },                    // Optional text
macros_json: { type: ['object', 'null'] },                // Optional complex object
```

**Why explicit null types**: API consumers know what's optional

## Business Logic Implementation

### Click Tracking Flow

#### 1. Request Validation
```javascript
const offerId = parseInt(query.offer_id);
const publisherId = parseInt(query.pub_id);
// Validate required parameters exist and are integers
```

**Why parseInt**: URL params are strings, need conversion for database queries

#### 2. Entity Existence Checks
```javascript
const offer = await offerService.findById(offerId);
if (!offer || offer.status !== 'live') {
  return fallbackRedirect;
}
```

**Why status check**: Only live offers should generate traffic

#### 3. Assignment Validation
```javascript
const [assignmentRows] = await pool.query(
  'SELECT * FROM publisher_offers WHERE publisher_id = ? AND offer_id = ? AND status = ?',
  [publisherId, offerId, 'active']
);
```

**Why assignment required**: Only assigned publishers can promote offers

#### 4. Multi-Level Capping Logic

**Offer-Level Capping**:
```javascript
// Check daily cap
if (offer.capping_type === 'daily') {
  const todayClicks = await this.getTodayClicks(offerId);
  if (todayClicks >= offer.daily_cap) {
    return applyCapAction(offer);
  }
}
```

**Assignment-Level Capping**:
```javascript
// Check assignment budget cap
if (assignment.capping_budget_duration === 'daily') {
  const spent = await this.getAssignmentSpend(assignment, 'daily');
  if (spent >= assignment.capping_budget_amount) {
    return fallbackRedirect;
  }
}
```

**Why hierarchical capping**: Different stakeholders control different limits

#### 5. Targeting Evaluation

**Device Targeting Example**:
```javascript
const deviceInfo = parseDevice(userAgent);
const deviceTargeting = offer.device_targeting_json;

// If targeting is configured
if (deviceTargeting && Array.isArray(deviceTargeting)) {
  const isAllowed = deviceTargeting.includes(deviceInfo.deviceType);
  const shouldAllow = offer.device_action === 'ALLOW';

  if (shouldAllow ? !isAllowed : isAllowed) {
    return fallbackRedirect;
  }
}
```

**Why ALLOW/BLOCK logic**: Supports both allowlists and blocklists

#### 6. Device Fingerprinting
```javascript
const deviceInfo = parseDevice(userAgent);
// Extracts: deviceType, browser, os, osVersion, deviceBrand, deviceModel
```

**Why comprehensive fingerprinting**: Attribution accuracy and fraud detection

#### 7. Click Logging
```javascript
const clickUuid = uuidv4();
await pool.query(`
  INSERT INTO clicks (
    click_uuid, offer_id, publisher_id, publisher_offer_id,
    ip, user_agent, referrer, country, domain,
    device_type, browser, os, os_version, device_brand, device_model,
    source_id, device_id, google_id, android_id, rcid, tid,
    timestamp, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
`, [/* parameters */]);
```

**Why comprehensive logging**: Every data point needed for attribution and analysis

#### 8. URL Generation & Redirect
```javascript
const finalUrl = replaceMacros(offer.offer_url, {
  click_id: clickUuid,
  publisher_id: publisherId,
  // ... other macros
});

return reply.redirect(finalUrl);
```

**Why macro replacement**: Dynamic URL generation for tracking

### Conversion Tracking Logic

#### Postback Processing
```javascript
// Deduplication check
const [existing] = await pool.query(
  'SELECT id FROM conversions WHERE rcid = ? AND offer_id = ?',
  [rcid, offerId]
);

if (existing) {
  return { duplicate: true };
}

// Link to original click
const [clickRows] = await pool.query(
  'SELECT * FROM clicks WHERE rcid = ? AND offer_id = ?',
  [rcid, offerId]
);

// Calculate payout with overrides
const payout = assignment.payout_override || offer.affiliate_amount;
const finalPayout = (amount * payout) / 100; // Percentage-based

// Insert conversion
await pool.query(`
  INSERT INTO conversions (
    conversion_uuid, click_uuid, offer_id, publisher_id, publisher_offer_id,
    rcid, status, amount, payout, ip, timestamp
  ) VALUES (UUID(), ?, ?, ?, ?, ?, 'pending', ?, ?, ?, NOW())
`, [clickUuid, offerId, publisherId, assignmentId, rcid, amount, finalPayout, ip]);
```

**Why deduplication**: Prevent double-paying for same conversion
**Why link to click**: Attribution chain (click → conversion)
**Why override system**: Custom pricing per affiliate

### Statistics Aggregation

#### Daily Stats Updates
```javascript
// Triggered by conversion events
const today = new Date().toISOString().split('T')[0];

await pool.query(`
  INSERT INTO daily_offer_stats (offer_id, day, conversions, revenue, payout, profit)
  VALUES (?, ?, 1, ?, ?, ?)
  ON DUPLICATE KEY UPDATE
    conversions = conversions + 1,
    revenue = revenue + VALUES(revenue),
    payout = payout + VALUES(payout),
    profit = profit + VALUES(profit)
`, [offerId, today, amount, payout, amount - payout]);
```

**Why ON DUPLICATE KEY UPDATE**: Handle multiple conversions per day efficiently
**Why separate profit calculation**: Business intelligence metric

## Data Flow & Relationships

### Click-to-Conversion Attribution Flow

```
1. User clicks affiliate link
   ↓
2. GET /click?offer_id=123&pub_id=456&rcid=abc123
   ↓
3. TrackingService.trackClick()
   ↓
4. Validate offer, publisher, assignment exist and are active
   ↓
5. Apply capping rules (offer → assignment level)
   ↓
6. Apply targeting rules (device, OS, browser, geo)
   ↓
7. Log click with UUID and device fingerprint
   ↓
8. Redirect to offer URL with click_id in parameters
   ↓
9. User converts on advertiser site
   ↓
10. Advertiser calls GET /postback?rcid=abc123&amount=50.00
    ↓
11. PostbackService.processConversion()
    ↓
12. Find original click by rcid + offer_id
    ↓
13. Check for duplicates
    ↓
14. Calculate payout (with assignment overrides)
    ↓
15. Log conversion with pending status
    ↓
16. Update daily statistics
    ↓
17. Apply auto-approval rules if configured
    ↓
18. Send notifications to publisher and advertiser
```

### Data Consistency Guarantees

#### Transaction Boundaries
- **Click logging**: Single insert operation (no transaction needed)
- **Conversion processing**: Transaction wraps deduplication check + insert
- **Assignment updates**: Transaction for complex business rule updates

#### Referential Integrity
- **Foreign Keys**: All relationships enforced at database level
- **Cascading Deletes**: Publisher deletion removes assignments and clicks
- **SET NULL**: Conversion publisher_offer_id set to NULL if assignment deleted

## Security & Authentication

### Authentication Strategy

#### Admin Authentication
```javascript
// JWT-based authentication for admin endpoints
const authMiddleware = async (request, reply) => {
  const token = request.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return reply.code(401).send({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    request.admin = decoded;
  } catch (error) {
    return reply.code(401).send({ error: 'Invalid token' });
  }
};
```

**Why JWT**: Stateless authentication for API scalability

#### Public Endpoint Security
- **No Authentication**: Tracking endpoints must be public for affiliates
- **Rate Limiting**: Prevent abuse (implemented at infrastructure level)
- **Input Validation**: Strict parameter validation prevents injection
- **Deduplication**: Prevents duplicate conversion payouts

### Data Protection

#### PII Handling
- **IP Addresses**: Stored for attribution, consider GDPR implications
- **User Agents**: Device fingerprinting data
- **Tracking IDs**: Various device identifiers for attribution

#### Financial Security
- **Amount Validation**: Server-side validation prevents negative payouts
- **Deduplication**: Prevents double-spending attacks
- **Audit Trail**: Complete transaction history

## Performance Considerations

### Database Optimization

#### Indexing Strategy
```sql
-- High-cardinality indexes for filtering
CREATE INDEX idx_offers_visibility ON offers(offer_visibility);
CREATE INDEX idx_clicks_offer_timestamp ON clicks(offer_id, timestamp);

-- Composite indexes for common queries
CREATE INDEX idx_publisher_offers_active ON publisher_offers(publisher_id, offer_id, status);

-- Partial indexes for active records
CREATE INDEX idx_active_offers ON offers(status) WHERE status = 'live';
```

**Why composite indexes**: Query patterns use multiple columns together
**Why partial indexes**: Smaller indexes for common filter values

#### Query Optimization

**Pagination for Large Datasets**:
```javascript
const listOffers = async (filters = {}) => {
  const page = Number(filters.page) || 1;
  const limit = Math.min(Number(filters.limit) || 20, 100); // Max 100 per page
  const offset = (page - 1) * limit;

  // Separate count and data queries
  const [countRows] = await pool.query(countSql, params);
  const [rows] = await pool.query(`${listSql} LIMIT ? OFFSET ?`, [...params, limit, offset]);
};
```

**Why separate count**: Avoid expensive COUNT(*) on large LIMIT queries

**Connection Pooling**:
```javascript
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10,        // Maximum connections
  queueLimit: 0,              // Unlimited queue
  acquireTimeout: 60000,      // 60 second timeout
  timeout: 60000,             // Query timeout
});
```

**Why pooling**: Reuse connections, handle concurrency

### Caching Strategy

#### Offer Caching (Recommended)
```javascript
// Cache frequently accessed offers
const offerCache = new Map();

const getCachedOffer = async (id) => {
  if (offerCache.has(id)) {
    return offerCache.get(id);
  }

  const offer = await pool.query('SELECT * FROM offers WHERE id = ?', [id]);
  offerCache.set(id, offer);

  // Cache invalidation on updates
  return offer;
};
```

**Why cache offers**: High read frequency, low write frequency

### Monitoring & Observability

#### Key Metrics to Monitor
- **Response Times**: API endpoint performance
- **Error Rates**: Failed requests by endpoint
- **Database Connections**: Pool utilization
- **Conversion Rates**: Business metric tracking
- **Click Quality**: Valid clicks vs rejected clicks

#### Logging Strategy
```javascript
const logger = {
  info: (message, meta) => console.log(JSON.stringify({ level: 'info', message, ...meta, timestamp: new Date() })),
  error: (message, error, meta) => console.error(JSON.stringify({ level: 'error', message, error: error.message, stack: error.stack, ...meta, timestamp: new Date() }))
};
```

**Why structured logging**: Machine-readable logs for monitoring systems

## Deployment & Configuration

### Environment Configuration
```javascript
const config = {
  port: process.env.PORT || 3000,
  db: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES || '24h',
  },
  redis: {  // For future caching
    host: process.env.REDIS_HOST,
    port: process.env.REDIS_PORT || 6379,
  }
};
```

**Why environment variables**: Deployment flexibility, security

### Migration Strategy
```sql
-- Versioned migrations in db/migrations/
-- 001_initial_schema.sql - Base schema
-- 002_add_publisher_password.sql - Feature addition
-- 003_remove_unused_columns.sql - Cleanup
-- 004_add_assignment_fields.sql - New functionality
-- 005_rename_offer_url.sql - Refactoring
-- 006_sync_offer_ui_fields.sql - Latest schema sync
```

**Why numbered migrations**: Ordered execution, prevents conflicts

## Business Rules & Constraints

### Offer Lifecycle
1. **Draft**: Created but not published
2. **Live**: Active and generating traffic
3. **Paused**: Temporarily stopped, can be resumed
4. **No Deletion**: Offers never deleted, only status changes (audit trail)

### Publisher States
1. **Pending**: Applied but not approved
2. **Active**: Can promote offers
3. **Suspended**: Blocked due to violations
4. **No Deletion**: Publishers never deleted (financial liability)

### Financial Rules
- **Positive Amounts Only**: All monetary values ≥ 0
- **Percentage Validation**: Approval percentages 0-100
- **Payout Calculation**: amount × affiliate_percentage
- **Override Priority**: Assignment overrides > Offer defaults

### Attribution Rules
- **First Click Attribution**: One conversion per rcid per offer
- **Time Window**: Conversions linked to clicks within reasonable timeframe
- **Fraud Prevention**: Deduplication prevents multiple payouts

## Conclusion

This comprehensive design creates a robust, scalable affiliate network management system with:

- **Complete Audit Trail**: Every click, impression, and conversion tracked
- **Flexible Targeting**: Multi-dimensional traffic filtering
- **Hierarchical Capping**: Multi-level budget and conversion controls
- **Financial Integrity**: Duplicate prevention and accurate attribution
- **Performance Optimized**: Indexed queries and efficient data structures
- **Business Flexible**: Configurable rules without code changes
- **Security Conscious**: Input validation and fraud prevention
- **Scalable Architecture**: Layered design supporting growth

The system balances complexity with maintainability, providing comprehensive affiliate network functionality while remaining understandable and extensible.
