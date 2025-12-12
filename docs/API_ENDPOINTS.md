# API Endpoints (Pulpy Reporting Portal)

Base URL: `http://localhost:5000`

Auth: JWT Bearer required for `/api/admin/**` and `/api/auth/profile`. Public routes: `/click`, `/imp`, `/postback`, `/health`, `/api/auth/register`, `/api/auth/login`.

Common success format (typical): 
```json
{ "success": true, "data": { ... }, "message": "optional" }
```
Common error format (typical):
```json
{ "success": false, "error": "Bad Request", "message": "details", "details": [] }
```

## Authentication
- `POST /api/auth/register`  
  Body: `{ "email": string, "name": string, "password": string, "role": "admin" }`  
  Response: 201 with token in `data.token`.
- `POST /api/auth/login`  
  Body: `{ "email": string, "password": string }`  
  Response: 200 with token in `data.token`.
- `GET /api/auth/profile` (JWT)  
  Response: admin profile.

## Advertisers (JWT)
- `POST /api/admin/advertisers`  
  Required body: `name, email, country`. Optional: `company_name, website, notes, status`.
- `PATCH /api/admin/advertisers/:id`  
  Body: any of the advertiser fields.
- `GET /api/admin/advertisers`  
  Query: `status?, country?, search?, page?, limit?`
- `GET /api/admin/advertisers/:id`
- `DELETE /api/admin/advertisers/:id` (soft delete -> status inactive)

## Publishers (JWT)
- `POST /api/admin/publishers`  
  Required: `email`. Optional: `mobile, first_name, last_name, company_name, position, address, state, country, zip_code, tax_invoice_details (obj), payment_terms (obj), global_postback_url, status`.
- `PATCH /api/admin/publishers/:id`  
  Body: any publisher fields.
- `GET /api/admin/publishers`  
  Query: `status?, email?, company_name?, page?, limit?`
- `GET /api/admin/publishers/:id`
- `DELETE /api/admin/publishers/:id` (soft delete)

## Offers (JWT)
- `POST /api/admin/offers`  
  Required: `advertiser_id, name, offer_currency, country, advertiser_model, advertiser_amount, affiliate_model, affiliate_amount, offer_url`.  
  Optional: description, category, status, preview_url, token_type, macros_json, date/time fields, targeting JSONs, caps, fallback, postback configs, etc.
- `PATCH /api/admin/offers/:id`  
  Body: any offer fields (all optional).
- `PATCH /api/admin/offers/:id/status`  
  Body: `{ "status": "live|paused|draft" }`
- `GET /api/admin/offers`  
  Query: `status?, advertiser_id?, category?, search?, page?, limit?`
- `GET /api/admin/offers/:id`
- `DELETE /api/admin/offers/:id`

## Assignments (JWT)
- `POST /api/admin/assignments`  
  Body: `{ "publisher_id": number, "offer_id": number, "payout_override"?: number, "cap_override"?: number, "notes"?: string }`
- `GET /api/admin/assignments`
- `GET /api/admin/assignments/:id`
- `GET /api/admin/assignments/:id/tracking-url`
- `DELETE /api/admin/assignments/:id`

## Reports (JWT)
- `GET /api/admin/reports/dashboard`
- `GET /api/admin/reports/summary`  
  Query: `date_from?, date_to?, offer_id?, publisher_id?, page?, limit?`
- `GET /api/admin/reports/detailed`  
  Query: `date_from?, date_to?, offer_id?, publisher_id?, page?, limit?`

## Tracking (Public)
- `GET /click`  
  Query required: `offer_id`, `pub_id`; optional: `tid, rcid, source_id, device_id, google_id, android_id`.  
  Response: 302 redirect to offer URL with `click_id` appended.
- `GET /imp`  
  Query required: `offer_id`, `pub_id`; optional referrer headers.

## Postback (Public)
- `GET /postback`  
  Query typical: `click_id, rcid, amount, status`
- `POST /postback`  
  Body typical: `{ "click_id": string, "rcid": string, "amount": number, "status": string }`

## Test Conversion (JWT)
- `POST /api/admin/test-conversion`  
  Body: `{ "affiliate_url": "http://localhost:5000/click?offer_id=1&pub_id=1&tid=test123" }`

## Health
- `GET /health` -> `{ "status": "ok", "timestamp": "..." }`


