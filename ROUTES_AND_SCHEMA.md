# API Routes and Database Tables (Client-Friendly)

Auth: JWT Bearer (`Authorization: Bearer <token>`) for admin routes. Tracking/Postback/Health are public.

## Authentication (JWT)
- **POST /api/auth/register** – Create admin. Body: `{ email, name, password, role?="admin" }`.  
  Response 201: `{ success: true, data: { token, admin: { id, email, name, role } } }`
- **POST /api/auth/login** – Body: `{ email, password }`.  
  Response 200: `{ success: true, data: { token, admin: { id, email, name, role } } }`
- **GET /api/auth/profile** – Bearer.  
  Response 200: `{ success: true, data: { id, email, name, role, created_at } }`

## Admin – Publishers
- **POST /api/admin/publishers** – Create publisher (full profile, tax_invoice_details JSON, payment_terms JSON, global_postback_url).  
  Response 201: `{ success: true, data: { publisher } }`
- **PATCH /api/admin/publishers/:id** – Update any fields.  
  Response 200: `{ success: true, data: { publisher } }`
- **GET /api/admin/publishers** – List; filters: `status?, email?, company_name?, page?, limit?`.  
  Response 200: `{ success: true, data: [publisher...], pagination: { page, limit, total, totalPages } }`
- **GET /api/admin/publishers/:id** – Detail.  
  Response 200: `{ success: true, data: { publisher } }`
- **DELETE /api/admin/publishers/:id** – Soft delete (status → suspended).  
  Response 200: `{ success: true, data: { publisher } }`

## Admin – Offers
- **POST /api/admin/offers** – Create offer. Body: `{ name, category("CPA"|"CPI"|"CPM"), advertiser_revenue, affiliate_model_cost, start_at?, end_at?, offer_url, capping_per_day?, fallback_url?, status? }`.  
  Response 201: `{ success: true, data: { offer } }`
- **PATCH /api/admin/offers/:id** – Update any fields.  
  Response 200: `{ success: true, data: { offer } }`
- **PATCH /api/admin/offers/:id/status** – Body: `{ status: "pending"|"active"|"deactivate"|"remove" }`.  
  Response 200: `{ success: true, data: { offer } }`
- **GET /api/admin/offers/:type** – :type = all | live | approved.  
  Response 200: `{ success: true, data: { rows: [offer...], page?, limit?, total? } }`
- **GET /api/admin/offers/categories** –  
  Response 200: `{ success: true, data: [{ category, count }] }`
- **GET /api/admin/offers/single/:id** –  
  Response 200: `{ success: true, data: { offer } }`
- **DELETE /api/admin/offers/:id** – Soft delete (status → remove).  
  Response 200: `{ success: true, data: { offer } }`

## Admin – Assignments
- **POST /api/admin/assignments** – Body: `{ publisher_id, offer_id, payout_override?, cap_override?, notes?, status? }`.  
  Response 201: `{ success: true, data: { assignment } }`
- **GET /api/admin/assignments** – Filters: `publisher_id?, offer_id?`.  
  Response 200: `{ success: true, data: { rows: [assignment...], page?, limit?, total? } }`
- **GET /api/admin/assignments/:id** – Detail.  
  Response 200: `{ success: true, data: { assignment } }`
- **GET /api/admin/assignments/:id/tracking-url** –  
  Response 200: `{ success: true, data: { tracking_url } }`
- **DELETE /api/admin/assignments/:id** –  
  Response 200: `{ success: true }`

## Admin – Test Conversion
- **POST /api/admin/test-conversion** – Body: `{ affiliate_url, click_id? }`. Simulates a click if click_id not provided.  
  Response 200: `{ success: true, data: { click_id, offer_id, publisher_id, tracking_url } }`

## Tracking (Public)
- **GET /click** – Params: `offer_id, pub_id, tid?, rcid?, source_id?, device_id?, google_id?, android_id?`. Logs click, enforces status/capping, redirects to offer_url or fallback.  
  Response: `302` redirect; on failure JSON `{ success: false, error, message }`
- **GET /imp** – Params: `offer_id, pub_id`. Logs impression, returns 1x1 pixel.  
  Response 200: transparent pixel; on failure JSON error.

## Postback (Public)
- **GET /postback** – Params: `click_id?, rcid?, amount?, status?=approved`. Dedupes by (rcid, offer_id); applies payout override; updates stats.  
  Response 200: `{ success: true, data: { conversion, duplicate: boolean } }`
- **POST /postback** – Body JSON same as GET.  
  Response 200: `{ success: true, data: { conversion, duplicate: boolean } }`

## Reporting (Admin, Bearer)
- **GET /api/admin/reports/dashboard** – Totals: impressions, clicks, unique_clicks, conversions, CR%, revenue, payout, profit, total/active offers, total/active/pending affiliates.  
  Response 200: `{ success: true, data: { impressions, clicks, unique_clicks, conversions, cr, revenue, payout, profit, total_offers, active_offers, total_publishers, active_publishers, pending_publishers } }`
- **GET /api/admin/reports/summary** – Filters: `date_from, date_to, offer_id, publisher_id, country, ip, tid, rcid, device_brand, os, browser, referrer, source_id, google_id, android_id, hour`.  
  Response 200: `{ success: true, data: { totals: { impressions, clicks, unique_clicks, conversions, revenue, payout, profit, cr }, breakdown?: [...] } }`
- **GET /api/admin/reports/detailed** – Same filters + `page, limit`.  
  Response 200: `{ success: true, data: { rows: [ { impression?, click?, conversion?, device, geo, rcid, tid, source_id, google_id, android_id, referrer, ts } ], page, limit, total } }`
- **GET /api/admin/reports/export** – CSV export (to implement).  
  Response 200: CSV stream or `{ success: false, message: "Not implemented" }` (placeholder)

## Health
- **GET /health** – `{ status: "ok", timestamp }`

## Database Tables (MySQL)
- **admin_users**: id, email, name, password_hash, role, created_at, updated_at
- **publishers**: id, email, mobile, first_name, last_name, company_name, position, address, state, country, zip_code, tax_invoice_details JSON, payment_terms JSON, global_postback_url, status, created_at, updated_at
- **offers**: id, name, category (CPA/CPI/CPM), advertiser_revenue, affiliate_model_cost, start_at, end_at, offer_url, capping_per_day, fallback_url, status, url_key unique, created_at, updated_at
- **publisher_offers**: id, publisher_id, offer_id, payout_override, cap_override, status, assigned_at, notes, UNIQUE(publisher_id, offer_id)
- **clicks**: id, click_uuid UUID, offer_id, publisher_id, publisher_offer_id, ip, user_agent, referrer, country, region, city, isp, location JSON, domain, device_type, browser, os, os_version, device_brand, device_model, source_id, device_id, google_id, android_id, rcid, tid, timestamp, created_at
- **impressions**: id, imp_uuid UUID, offer_id, publisher_id, ip, user_agent, referrer, timestamp, created_at
- **conversions**: id, conversion_uuid UUID, click_uuid, offer_id, publisher_id, publisher_offer_id, rcid (unique with offer_id), status, amount, payout, ip, timestamp, postback_payload JSON, created_at, updated_at
- **daily_offer_stats**: id, offer_id, day, impressions, clicks, unique_clicks, conversions, revenue, payout, profit, created_at, updated_at, UNIQUE(offer_id, day)

> Migrations currently PostgreSQL style; needs MySQL conversions for JSON/UUID/upserts.

## Business Logic
- Offer status: pending block; active allow; deactivate → fallback redirect; remove block/hide.
- Capping: capping_per_day; per-assignment cap_override; capped → fallback.
- Conversion dedupe: unique (rcid, offer_id).
- Unique clicks: first IP+publisher+offer per 24h increments unique_clicks.
- Payout: assignment payout_override else offer affiliate_model_cost.
- Tracking URL: `/click?offer_id=X&pub_id=Y&tid={tid}`.

## Reporting/Dashboard Expectations
- Reports include device/browser/OS/model, location (if available), RCID, TID, source_id, google_id, android_id, referrer.
- Dashboard shows totals: impressions, clicks, conversions, CR%, revenue, payout, profit, total/active offers, total/active/pending affiliates.

