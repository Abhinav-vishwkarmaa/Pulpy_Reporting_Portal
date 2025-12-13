# Routes and Services Update Summary

## Overview

All routes and services have been updated to work with the new assignment system that includes publisher-specific URLs, capping, and conversion approval settings.

---

## 1. Tracking Routes (`/click` and `/imp`)

### Updated: `TrackingService.trackClick()`

**Changes:**
- ✅ Uses `assignment.offer_url` if available (publisher-specific tracking URL)
- ✅ Falls back to `offer.offer_url` if assignment URL not set
- ✅ Replaces macros in assignment URL: `{TID}`, `{RCID}`, `{CLICK_ID}`
- ✅ Checks assignment-level budget capping before recording click
- ✅ Checks assignment-level conversion capping before recording click
- ✅ Fixed `updateDailyStats()` bug (was referencing undefined `assignment` variable)

**New Methods Added:**
- `isAssignmentBudgetCapHit()` - Checks if assignment budget cap is exceeded
- `isAssignmentConversionCapHit()` - Checks if assignment conversion cap is exceeded

**Capping Priority:**
1. Assignment budget cap (if set)
2. Assignment conversion cap (if set)
3. Offer total cap
4. Offer capping_type cap (daily/weekly/monthly)

### Updated: `TrackingService.trackImpression()`

**Changes:**
- ✅ Validates assignment exists and is active
- ✅ Fixed `updateDailyStats()` to accept `publisherId` parameter

---

## 2. Postback Routes (`/postback`)

### Updated: `PostbackService.processPostback()`

**Changes:**
- ✅ Fetches assignment data using `assignmentService.findById()`
- ✅ Uses `assignment.payout_override` if available (instead of offer's affiliate_amount)
- ✅ Implements `conversion_approval_percentage` for auto-approval logic
- ✅ Checks assignment-level budget capping before recording conversion
- ✅ Checks assignment-level conversion capping before recording conversion
- ✅ Sends postback to `assignment.callback_url` after conversion is recorded
- ✅ Replaces macros in callback URL: `{click_id}`, `{conversion_id}`, `{rcid}`, `{payout}`, `{amount}`, `{status}`

**New Methods Added:**
- `isAssignmentBudgetCapHit()` - Checks assignment budget cap
- `isAssignmentConversionCapHit()` - Checks assignment conversion cap
- `sendPublisherPostback()` - Sends GET request to publisher's callback URL

**Conversion Status Logic:**
- If `conversion_approval_percentage` is set (0-100):
  - Randomly approves that percentage of conversions
  - Others are set to 'pending'
- If not set, uses the status from the postback request

**Postback Macros Supported:**
- `{click_id}` / `{CLICK_ID}` - Click UUID
- `{conversion_id}` / `{CONVERSION_ID}` - Conversion UUID
- `{rcid}` / `{RCID}` - Revenue Click ID
- `{payout}` / `{PAYOUT}` - Payout amount
- `{amount}` / `{AMOUNT}` - Conversion amount
- `{status}` / `{STATUS}` - Conversion status

---

## 3. Test Conversion Route (`/api/admin/test-conversion`)

### Status: ✅ No changes needed

The test conversion endpoint works with the updated tracking service, so it automatically benefits from:
- Assignment-specific offer URLs
- Assignment-level capping checks
- Updated assignment data structure

---

## 4. Assignment-Level Capping Logic

### Budget Capping

Checks total revenue (sum of conversion amounts) for the assignment within the specified duration:
- **hour**: Current hour
- **day**: Current day
- **week**: Current week
- **month**: Current month

**SQL Logic:**
```sql
SELECT COALESCE(SUM(amount), 0) as total_revenue
FROM conversions
WHERE offer_id = ? AND publisher_id = ? AND [duration_condition]
```

### Conversion Capping

Checks total conversion count for the assignment within the specified duration:
- **hour**: Current hour
- **day**: Current day
- **week**: Current week
- **month**: Current month

**SQL Logic:**
```sql
SELECT COUNT(*) as conversion_count
FROM conversions
WHERE offer_id = ? AND publisher_id = ? AND [duration_condition]
```

---

## 5. URL Macro Replacement

### Assignment Offer URL Macros

When `assignment.offer_url` is used, the following macros are replaced:
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
- `{status}` / `{STATUS}` → Conversion status

---

## 6. Files Updated

1. ✅ `src/services/trackingService.js`
   - Updated `trackClick()` to use assignment.offer_url
   - Added assignment-level capping checks
   - Fixed `updateDailyStats()` bug
   - Updated `trackImpression()` to validate assignment

2. ✅ `src/services/postbackService.js`
   - Updated `processPostback()` to use assignment data
   - Added assignment-level capping checks
   - Implemented conversion_approval_percentage logic
   - Added `sendPublisherPostback()` method

3. ✅ `src/routes/tracking.js` - No changes needed (uses updated service)

4. ✅ `src/routes/postback.js` - No changes needed (uses updated service)

5. ✅ `src/controllers/adminController.js` - testConversion uses updated tracking service

---

## 7. Capping Priority Order

When a click or conversion is processed, capping is checked in this order:

1. **Assignment Budget Cap** (if set) → Reject if exceeded
2. **Assignment Conversion Cap** (if set) → Reject if exceeded
3. **Offer Total Cap** (if set) → Apply cap action if exceeded
4. **Offer Capping Type Cap** (daily/weekly/monthly) → Apply cap action if exceeded

**Note:** Assignment-level caps are **hard stops** (reject immediately). Offer-level caps use the `cap_action` setting (fallback/pause).

---

## 8. Postback Flow

1. Postback received at `/postback`
2. Find click and assignment
3. Check assignment-level capping (budget & conversions)
4. Check offer-level capping
5. Determine conversion status (auto-approval if percentage set)
6. Insert conversion record
7. Update daily stats
8. **Send postback to publisher's callback_url** (async, fire-and-forget)
9. Return success response

**Important:** Postback failures to publisher callback URL do NOT fail the conversion. They are logged but the conversion is still recorded.

---

## 9. Testing Checklist

- [ ] Test click tracking with assignment.offer_url
- [ ] Test click tracking without assignment.offer_url (fallback to offer.offer_url)
- [ ] Test assignment budget cap rejection
- [ ] Test assignment conversion cap rejection
- [ ] Test macro replacement in assignment.offer_url
- [ ] Test postback processing with assignment.callback_url
- [ ] Test conversion_approval_percentage auto-approval
- [ ] Test macro replacement in callback_url
- [ ] Test postback failure handling (callback URL unreachable)
- [ ] Test impression tracking with assignment validation

---

## 10. Example Flows

### Click Tracking Flow

```
GET /click?offer_id=10&pub_id=7&tid=test123
↓
1. Validate offer & publisher
2. Get assignment (publisher_id=7, offer_id=10)
3. Check assignment budget cap → PASS
4. Check assignment conversion cap → PASS
5. Check offer caps → PASS
6. Record click
7. Use assignment.offer_url (or offer.offer_url)
8. Replace macros: {TID} → test123
9. Redirect to final URL
```

### Postback Flow

```
POST /postback?click_id=xxx&rcid=rcid123&amount=10.00
↓
1. Find click & assignment
2. Check assignment budget cap → PASS
3. Check assignment conversion cap → PASS
4. Check offer caps → PASS
5. Calculate status (if conversion_approval_percentage=50%, randomly approve)
6. Insert conversion
7. Update stats
8. Send GET request to assignment.callback_url
   → https://affiliate.com/postback?click_id=xxx&payout=5.00&status=approved
```

---

## Summary

All routes now fully support the new assignment system with:
- ✅ Publisher-specific tracking URLs
- ✅ Publisher-specific callback URLs
- ✅ Assignment-level budget capping
- ✅ Assignment-level conversion capping
- ✅ Auto-approval percentage logic
- ✅ Macro replacement in URLs
- ✅ Proper fallback handling
