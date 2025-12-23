# Dashboard API Implementation Summary

## Overview
All 6 dashboard API endpoints have been implemented and are ready for frontend integration. All endpoints are protected with admin authentication and return data in the specified format.

---

## API Endpoints

### Base URL
All endpoints are prefixed with: `/api/admin/reports/dashboard`

**Authentication Required:** Yes (Admin token in Authorization header)

---

## 1. Main Dashboard Data

**Endpoint:** `GET /api/admin/reports/dashboard`

**Description:** Returns aggregated statistics for the main dashboard KPI cards.

**Response Format:**
```json
{
  "success": true,
  "data": {
    "conversions": {
      "total": 2006,
      "yesterday": 3458,
      "conversion_rate": 1.824,
      "approved": 1950,
      "pending": 50,
      "rejected": 6
    },
    "clicks": {
      "total": 109984,
      "yesterday": 193000,
      "unique": 85000,
      "mtd": 1940000
    },
    "impressions": {
      "total": 0,
      "yesterday": 0,
      "mtd": 0
    },
    "revenue": {
      "total": 721,
      "yesterday": 1015,
      "mtd": 17127,
      "profit": 0,
      "payout": 721
    },
    "offers": {
      "total": 45,
      "active": 37,
      "paused": 5,
      "pending": 3
    },
    "publishers": {
      "total": 120,
      "active": 95,
      "pending": 13,
      "suspended": 12
    },
    "advertisers": {
      "total": 25,
      "active": 20
    }
  }
}
```

**Key Features:**
- All numeric values return `0` instead of `null`
- `yesterday` values are provided for trend calculations
- `mtd` = Month-to-Date (from first day of current month to today)
- `conversion_rate` is calculated as: `(conversions / clicks) * 100`

---

## 2. Top Offers with Conversions

**Endpoint:** `GET /api/admin/reports/dashboard/top-offers`

**Query Parameters:**
- `limit` (optional, default: 5) - Number of top offers to return
- `date_from` (optional, default: today) - Start date (YYYY-MM-DD)
- `date_to` (optional, default: today) - End date (YYYY-MM-DD)

**Example Request:**
```
GET /api/admin/reports/dashboard/top-offers?limit=5&date_from=2024-01-01&date_to=2024-01-31
```

**Response Format:**
```json
{
  "success": true,
  "data": [
    {
      "offer_id": "21730687",
      "offer_name": "Offer Name 1",
      "conversions": 502
    },
    {
      "offer_id": "20486826",
      "offer_name": "Offer Name 2",
      "conversions": 402
    }
  ]
}
```

**Notes:**
- Results are sorted by conversions (descending)
- Only offers with conversions > 0 are returned
- `offer_id` is returned as a string

---

## 3. Performance Chart Data

**Endpoint:** `GET /api/admin/reports/dashboard/performance`

**Query Parameters:**
- `date_from` (optional, default: 30 days ago) - Start date (YYYY-MM-DD)
- `date_to` (optional, default: today) - End date (YYYY-MM-DD)
- `group_by` (optional, default: "day") - Grouping: "day", "week", or "month"

**Example Request:**
```
GET /api/admin/reports/dashboard/performance?date_from=2024-01-01&date_to=2024-01-31&group_by=day
```

**Response Format:**
```json
{
  "success": true,
  "data": [
    {
      "date": "2024-01-01",
      "clicks": 53300,
      "conversions": 1000
    },
    {
      "date": "2024-01-08",
      "clicks": 68000,
      "conversions": 1200
    }
  ]
}
```

**Date Format by Group:**
- `day`: "YYYY-MM-DD" (e.g., "2024-01-15")
- `week`: "YYYY-WW" (e.g., "2024-03" for week 3)
- `month`: "YYYY-MM" (e.g., "2024-01")

**Notes:**
- Data is sorted chronologically (ascending)
- Missing dates are not filled (only dates with data are returned)
- Both clicks and conversions are included for each date

---

## 4. Top Affiliates Chart

**Endpoint:** `GET /api/admin/reports/dashboard/top-affiliates`

**Query Parameters:**
- `limit` (optional, default: 5) - Number of top affiliates to return
- `date_from` (optional, default: start of month) - Start date (YYYY-MM-DD)
- `date_to` (optional, default: today) - End date (YYYY-MM-DD)

**Example Request:**
```
GET /api/admin/reports/dashboard/top-affiliates?limit=5&date_from=2024-01-01&date_to=2024-01-31
```

**Response Format:**
```json
{
  "success": true,
  "data": [
    {
      "publisher_id": 1,
      "publisher_name": "Affiliate Company 1",
      "conversions": 450
    },
    {
      "publisher_id": 2,
      "publisher_name": "Affiliate Company 2",
      "conversions": 380
    }
  ],
  "total_conversions": 2006
}
```

**Notes:**
- `publisher_name` uses `company_name` if available, otherwise falls back to `first_name` or `email`
- `total_conversions` includes conversions from ALL affiliates (not just top N)
- Results are sorted by conversions (descending)
- Only affiliates with conversions > 0 are returned

---

## 5. Info Cards Data

**Endpoint:** `GET /api/admin/reports/dashboard/info-cards`

**Description:** Returns data for information cards (Active Offers, Offer Requests, Pending Affiliates, Account Manager).

**Response Format:**
```json
{
  "success": true,
  "data": {
    "active_offers": 37,
    "offer_requests": 0,
    "pending_affiliates": 13,
    "account_manager": {
      "name": "Sukhwinder Pal Singh",
      "telegram": "@username",
      "skype": "username",
      "email": "manager@example.com",
      "phone": "+1234567890"
    },
    "signup_link": "https://signup.example.com/affiliates-advertisers"
  }
}
```

**Notes:**
- `offer_requests` is currently hardcoded to 0 (may need separate table/endpoint)
- `account_manager` and `signup_link` are placeholders - should be configured via environment variables or admin settings

---

## 6. Top Countries

**Endpoint:** `GET /api/admin/reports/dashboard/top-countries`

**Query Parameters:**
- `limit` (optional, default: 10) - Number of top countries to return
- `date_from` (optional, default: start of month) - Start date (YYYY-MM-DD)
- `date_to` (optional, default: today) - End date (YYYY-MM-DD)
- `metric` (optional, default: "conversions") - Sort by: "clicks", "conversions", or "revenue"

**Example Request:**
```
GET /api/admin/reports/dashboard/top-countries?limit=10&metric=conversions&date_from=2024-01-01&date_to=2024-01-31
```

**Response Format:**
```json
{
  "success": true,
  "data": [
    {
      "country_code": "US",
      "country_name": "United States",
      "clicks": 45000,
      "conversions": 850,
      "revenue": 320
    },
    {
      "country_code": "GB",
      "country_name": "United Kingdom",
      "clicks": 28000,
      "conversions": 520,
      "revenue": 195
    }
  ]
}
```

**Notes:**
- Country codes are ISO 3166-1 alpha-2 format (e.g., "US", "GB", "CA")
- Country names are mapped from common codes, falls back to code if name not found
- Results are sorted by the specified `metric` (descending)

---

## Error Response Format

All endpoints follow the standard error response format:

```json
{
  "success": false,
  "error": "Error Type",
  "message": "Human-readable error message",
  "details": [
    {
      "field": "/field_name",
      "message": "Specific validation error message"
    }
  ],
  "timestamp": "2024-12-23T17:46:55.154Z"
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `401` - Unauthorized (missing/invalid token)
- `500` - Internal Server Error

---

## Frontend Implementation Checklist

### 1. Dashboard Summary API
- [ ] Call `GET /api/admin/reports/dashboard` on component mount
- [ ] Display KPI cards with today's values
- [ ] Calculate and display trends using `yesterday` values
- [ ] Show conversion rate with proper formatting (2-3 decimal places)
- [ ] Handle loading and error states

### 2. Top Offers API
- [ ] Call `GET /api/admin/reports/dashboard/top-offers?limit=5`
- [ ] Display top 5 offers in the Conversions KPI card
- [ ] Show offer_id and conversions count
- [ ] Handle empty state (no conversions)

### 3. Performance Chart API
- [ ] Call `GET /api/admin/reports/dashboard/performance?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD`
- [ ] Default to last 30 days with `group_by=day`
- [ ] Render time-series chart with clicks and conversions
- [ ] Support date range picker for custom ranges
- [ ] Support group_by toggle (day/week/month)
- [ ] Format dates according to group_by selection

### 4. Top Affiliates API
- [ ] Call `GET /api/admin/reports/dashboard/top-affiliates?limit=5`
- [ ] Display donut/pie chart with top 5 affiliates
- [ ] Show `total_conversions` for "Others" category
- [ ] Display publisher names and conversion counts

### 5. Info Cards API
- [ ] Call `GET /api/admin/reports/dashboard/info-cards`
- [ ] Display active offers count
- [ ] Display pending affiliates count
- [ ] Display account manager contact information
- [ ] Show signup link (if applicable)

### 6. Top Countries API
- [ ] Call `GET /api/admin/reports/dashboard/top-countries?limit=10`
- [ ] Display world map visualization
- [ ] Support metric toggle (clicks/conversions/revenue)
- [ ] Show country codes and names
- [ ] Color-code countries by metric value

---

## Important Notes for Frontend

1. **Date Format:** All dates should be in `YYYY-MM-DD` format
2. **Null Values:** Backend returns `0` instead of `null` for numeric fields
3. **Authentication:** Include admin token in `Authorization` header: `Bearer <token>`
4. **Error Handling:** Check `success` field in response before accessing `data`
5. **Loading States:** Implement loading indicators for async data fetching
6. **Caching:** Consider caching dashboard data for 1-5 minutes to reduce API calls
7. **Timezone:** Backend uses UTC - frontend should handle timezone conversion for display

---

## Testing Endpoints

You can test the endpoints using:

```bash
# Main Dashboard
curl -X GET "http://localhost:5000/api/admin/reports/dashboard" \
  -H "Authorization: Bearer <admin_token>"

# Top Offers
curl -X GET "http://localhost:5000/api/admin/reports/dashboard/top-offers?limit=5" \
  -H "Authorization: Bearer <admin_token>"

# Performance Chart
curl -X GET "http://localhost:5000/api/admin/reports/dashboard/performance?date_from=2024-01-01&date_to=2024-01-31&group_by=day" \
  -H "Authorization: Bearer <admin_token>"

# Top Affiliates
curl -X GET "http://localhost:5000/api/admin/reports/dashboard/top-affiliates?limit=5" \
  -H "Authorization: Bearer <admin_token>"

# Info Cards
curl -X GET "http://localhost:5000/api/admin/reports/dashboard/info-cards" \
  -H "Authorization: Bearer <admin_token>"

# Top Countries
curl -X GET "http://localhost:5000/api/admin/reports/dashboard/top-countries?limit=10&metric=conversions" \
  -H "Authorization: Bearer <admin_token>"
```

---

## Questions or Issues?

If you encounter any issues or need clarification on the API responses, please refer to:
- `BACKEND_DASHBOARD_REQUIREMENTS.md` - Full requirements document
- `BACKEND_API_SUMMARY.md` - Quick reference guide

