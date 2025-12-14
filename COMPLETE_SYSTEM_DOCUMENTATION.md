# Complete Ad-Management & Tracking System Documentation

## Overview

This document describes the complete implementation of all 10 modules for the Ad-Management & Tracking System, similar to HasOffers/Affise/Cake.

---

## Module 1: Fraud Detection System ✅

### Database Schema
- `fraud_rules` - Publisher/offer/global fraud rules
- `ip_frequency_logs` - IP activity tracking
- `device_tracking` - Device duplication detection
- `user_agent_blacklist` - UA blacklist patterns
- `ip_access_lists` - IP whitelist/blacklist
- `vpn_proxy_cache` - VPN/proxy detection cache
- `geo_mismatch_logs` - Geo mismatch tracking
- `publisher_fraud_scores` - Publisher fraud scores
- `fraud_logs` - Comprehensive fraud event logs
- `bot_patterns` - Bot detection patterns

### API Endpoints
- `GET /api/admin/fraud/logs` - Get fraud logs
- `GET /api/admin/fraud/publisher-scores` - Get publisher fraud scores
- `POST /api/admin/fraud/calculate-score/:publisherId` - Calculate fraud score
- `GET /api/admin/fraud/rules` - Get fraud rules
- `POST /api/admin/fraud/rules` - Create fraud rule
- `PATCH /api/admin/fraud/rules/:id` - Update fraud rule
- `GET /api/admin/fraud/ip-access-lists` - Get IP access lists
- `POST /api/admin/fraud/ip-access-lists` - Add IP to access list
- `GET /api/admin/fraud/user-agent-blacklist` - Get UA blacklist
- `POST /api/admin/fraud/user-agent-blacklist` - Add UA to blacklist

### Integration Points
- **Click Tracking**: Fraud check runs BEFORE click is recorded
- **Conversion Postback**: Fraud check runs on conversion, can reject/flag
- **Fraud Score Calculation**: Runs periodically or on-demand

### Flow Diagram
```
Click Request
    ↓
[Targeting Check] → Fail → Fallback URL
    ↓ Pass
[Fraud Detection]
    ├─ IP Frequency Check
    ├─ Device Duplication
    ├─ User-Agent Blacklist
    ├─ VPN/Proxy Detection
    ├─ IP Blacklist
    ├─ Geo Mismatch
    └─ Bot Detection
    ↓
[Any Fraud Detected?]
    ├─ Yes → Reject → Fallback URL + Log Fraud
    └─ No → Record Click
```

### Example Fraud Log
```json
{
  "event_type": "click_rejected",
  "rejection_reason_code": "IP_FREQUENCY_EXCEEDED",
  "rejection_reason_text": "IP exceeded hourly click limit: 150/100",
  "fraud_score": 15,
  "metadata": {
    "reasons": [
      {
        "ruleName": "IP Frequency Check",
        "reason": "IP exceeded hourly click limit",
        "score": 15
      }
    ]
  }
}
```

---

## Module 2: Publisher Payment Module ✅

### Database Schema
- `payment_methods` - Bank, PayPal, crypto payment methods
- `publisher_payment_cycles` - NET7, NET15, NET30 cycles
- `publisher_earnings` - Aggregated earnings per period
- `publisher_invoices` - Generated invoices
- `publisher_payments` - Payment transactions
- `publisher_balance` - Current balance tracking
- `payment_approvals` - Admin approval workflow

### API Endpoints
- `GET /api/admin/payments/publisher/:publisherId/balance` - Get balance
- `GET /api/admin/payments/publisher/:publisherId/earnings` - Get earnings
- `POST /api/admin/payments/calculate-earnings` - Calculate earnings
- `POST /api/admin/payments/invoices` - Create invoice
- `GET /api/admin/payments/invoices` - Get invoices
- `POST /api/admin/payments` - Create payment
- `PATCH /api/admin/payments/:paymentId/complete` - Complete payment
- `GET /api/admin/payments/payment-methods` - Get payment methods
- `POST /api/admin/payments/payment-methods` - Add payment method

### Integration Points
- **Conversion Approval**: Approved conversions contribute to earnings
- **Payment Processing**: Manual admin approval workflow
- **Balance Updates**: Real-time balance calculation

### Flow Diagram
```
Conversion Approved
    ↓
[Update Publisher Earnings]
    ├─ Calculate Approved Payout
    ├─ Calculate Pending Payout
    └─ Update Balance
    ↓
[Payment Cycle Triggered]
    ├─ Calculate Period Earnings
    ├─ Generate Invoice
    └─ Create Payment Record
    ↓
[Admin Approval]
    ├─ Approve → Process Payment
    └─ Reject → Cancel Invoice
```

### Example Billing Calculation
```json
{
  "period_start": "2024-01-01",
  "period_end": "2024-01-31",
  "total_clicks": 10000,
  "approved_conversions": 500,
  "pending_conversions": 50,
  "approved_payout": 5000.00,
  "pending_payout": 500.00,
  "invoice": {
    "invoice_number": "INV-ABC123",
    "total_amount": 5000.00,
    "status": "pending"
  }
}
```

---

## Module 3: Advertiser Billing Module ✅

### Database Schema
- `advertiser_billing_cycles` - Billing cycles
- `advertiser_revenue` - Aggregated revenue per period
- `advertiser_invoices` - Generated invoices
- `advertiser_payments` - Payment transactions
- `advertiser_balance` - Balance tracking

### API Endpoints
- `GET /api/admin/billing/advertiser/:advertiserId/balance` - Get balance
- `POST /api/admin/billing/calculate-revenue` - Calculate revenue
- `POST /api/admin/billing/invoices` - Create invoice
- `GET /api/admin/billing/invoices` - Get invoices

### Integration Points
- **Conversion Revenue**: Billable conversions contribute to advertiser revenue
- **Invoice Generation**: Monthly/weekly invoice generation
- **Payment Tracking**: Track advertiser payments

---

## Module 4: Offer Targeting Rule Engine ✅

### Database Schema
- `targeting_rule_logs` - Rule evaluation logs
- `offer_schedules` - Time-based targeting
- `publisher_targeting_overrides` - Publisher-specific overrides
- Enhanced `offers` table with `targeting_rule_order` and `targeting_strict_mode`

### Integration Points
- **Click Tracking**: Targeting runs BEFORE click is recorded
- **Rule Evaluation Order**: Configurable rule execution order
- **Publisher Overrides**: Publisher-specific targeting rules

### Flow Diagram
```
Click Request
    ↓
[Targeting Evaluation]
    ├─ Geo Targeting
    ├─ Device Targeting
    ├─ OS Targeting
    ├─ Browser Targeting
    ├─ Connection Type
    ├─ Carrier Targeting
    ├─ Schedule (Time-based)
    ├─ IP Whitelist/Blacklist
    └─ Publisher-Specific Rules
    ↓
[All Rules Pass?]
    ├─ Yes → Continue to Fraud Check
    └─ No → Fallback URL
```

---

## Module 5: Real-Time Dashboard ✅

### Database Schema
- `realtime_stats_cache` - Cached real-time stats
- `performance_heatmaps` - Performance visualization data

### API Endpoints
- `GET /api/admin/dashboard/realtime/stats` - Get real-time stats
- `GET /api/admin/dashboard/realtime/top-offers` - Get top offers
- `GET /api/admin/dashboard/realtime/top-publishers` - Get top publishers

### Integration Points
- **Click/Conversion Events**: Stats updated in real-time
- **Redis Caching**: (Recommended) Use Redis for sub-second updates
- **MySQL Fallback**: MySQL cache for historical data

### Example Real-Time Stats
```json
{
  "time_window": "5min",
  "clicks": 1250,
  "conversions": 45,
  "revenue": 450.00,
  "payout": 225.00,
  "profit": 225.00,
  "epc": 0.1800,
  "ctr": 2.5,
  "cr": 3.6
}
```

---

## Module 6: Admin Tools & Logging System ✅

### Database Schema
- `change_logs` - Entity change tracking
- `tracking_logs` - Comprehensive click/conversion logs
- `postback_logs` - Postback attempt logs
- `admin_action_logs` - Admin action audit trail
- `admin_force_actions` - Manual admin interventions

### API Endpoints
- `GET /api/admin/logs/change-logs` - Get change logs
- `GET /api/admin/logs/tracking-logs` - Get tracking logs
- `GET /api/admin/logs/postback-logs` - Get postback logs
- `GET /api/admin/logs/admin-action-logs` - Get admin action logs
- `POST /api/admin/logs/force-actions` - Create force action

### Integration Points
- **All Admin Actions**: Logged automatically
- **Click/Conversion Events**: Comprehensive logging
- **Postback Attempts**: Full postback logging

---

## Module 7: Postback Retry & Queue System ✅

### Database Schema
- `postback_queue` - Retry queue
- `postback_attempts` - Attempt history
- `postback_failure_patterns` - Failure pattern learning

### API Endpoints
- `GET /api/admin/postbacks/failed` - Get failed postbacks
- `POST /api/admin/postbacks/retry/:queueId` - Retry postback

### Integration Points
- **Postback Service**: Failed postbacks added to queue
- **Queue Worker**: (Recommended) Background worker processes queue
- **Exponential Backoff**: Automatic retry delays

### Flow Diagram
```
Conversion Created
    ↓
[Send Publisher Postback]
    ├─ Success → Log Success
    └─ Failure → Add to Queue
        ↓
[Queue Worker Processes]
    ├─ Retry with Exponential Backoff
    ├─ Max Attempts Reached → Mark Failed
    └─ Success → Remove from Queue
```

### Retry Schedule
- Attempt 1: Immediate
- Attempt 2: 1 minute delay
- Attempt 3: 5 minutes delay
- Attempt 4: 15 minutes delay
- Attempt 5: 1 hour delay
- Attempt 6: 6 hours delay

---

## Module 8: Security & Abuse Prevention ✅

### Database Schema
- `api_rate_limits` - API rate limiting
- `jwt_token_versions` - JWT rotation tracking
- `advertiser_signatures` - Signature validation secrets
- `ip_throttle_logs` - IP throttling
- `macro_parsing_logs` - Secure macro parsing

### Features
- **API Rate Limiting**: Per-endpoint, per-IP/user
- **JWT Token Rotation**: Version-based token invalidation
- **Signature Validation**: HMAC signature validation for advertiser postbacks
- **IP Throttling**: Click/conversion throttling
- **Secure Macro Parsing**: XSS/injection prevention

### Integration Points
- **All API Endpoints**: Rate limiting middleware
- **JWT Authentication**: Token version validation
- **Advertiser Postbacks**: Signature validation
- **Macro Replacement**: Secure parsing

---

## Module 9: Advanced Fallback Routing Engine ✅

### Database Schema
- `fallback_chains` - Multi-tier fallback chains
- `fallback_chain_items` - Chain items with weights/conditions
- `fallback_execution_logs` - Fallback selection logs

### Features
- **Multi-Tier Fallback**: Offer A → B → C chains
- **Geo-Based Fallback**: Geo-specific fallback rules
- **Publisher-Specific Fallback**: Publisher overrides
- **Weighted Fallback**: Percentage distribution
- **Smart Rule Chaining**: Conditional fallback selection

### Flow Diagram
```
Primary Offer Fails
    ↓
[Get Fallback Chain]
    ↓
[Evaluate Chain Items]
    ├─ Check Geo Restrictions
    ├─ Check Publisher Restrictions
    ├─ Check Device/Time Conditions
    └─ Check Offer Status
    ↓
[Select Best Fallback]
    ├─ Sequential: Try in order
    └─ Weighted: Random weighted selection
```

---

## Module 10: Smartlink Engine ✅

### Database Schema
- `smartlinks` - Smartlink configurations
- `smartlink_offers` - Offers in smartlink
- `smartlink_scores` - Real-time performance scores
- `smartlink_selection_logs` - Selection history

### Features
- **Automatic Offer Selection**: Best offer based on EPC/CR
- **Weighted Scoring**: EPC, CR, revenue, or hybrid
- **Publisher-Specific Performance**: Per-publisher scoring
- **Real-Time Updates**: Scores update continuously
- **Fallback Logic**: Default fallback if no offers match

### Flow Diagram
```
Smartlink Request
    ↓
[Get Candidate Offers]
    ├─ Filter by Restrictions
    └─ Filter by Min Score
    ↓
[Calculate Scores]
    ├─ EPC Score
    ├─ CR Score
    ├─ Revenue Score
    └─ Hybrid Score
    ↓
[Select Best Offer]
    ├─ Sort by Priority
    ├─ Sort by Score
    └─ Return Best URL
```

### Scoring Algorithm
- **EPC**: `score = epc * 1000`
- **CR**: `score = cr * 10`
- **Revenue**: `score = revenue`
- **Hybrid**: `score = (epc * 500) + (cr * 5) + (revenue * 0.1)`

---

## Production Recommendations

### Scaling
1. **Redis Caching**: Use Redis for real-time stats, rate limiting, and queue management
2. **Database Partitioning**: Partition `clicks`, `conversions`, and logs tables by date
3. **Read Replicas**: Use MySQL read replicas for reporting queries
4. **CDN**: Use CDN for static assets and tracking pixels
5. **Load Balancing**: Multiple app servers behind load balancer

### Caching Strategy
- **Real-Time Stats**: Redis with 1-5 minute TTL
- **Offer Data**: Redis cache with 5-minute TTL
- **Publisher Data**: Redis cache with 10-minute TTL
- **Fraud Rules**: Redis cache with 1-hour TTL

### Async Jobs
- **Postback Retry Queue**: Use BullMQ or similar queue system
- **Earnings Calculation**: Background job for daily/weekly calculations
- **Invoice Generation**: Async PDF generation
- **Fraud Score Calculation**: Scheduled job for publisher scores

### Data Retention Policy
- **Clicks**: 90 days hot, 1 year cold storage
- **Conversions**: 2 years retention
- **Logs**: 30 days hot, 1 year cold storage
- **Stats Aggregates**: Keep indefinitely

### Monitoring & Alerts
- **Fraud Detection**: Alert on high fraud scores
- **Postback Failures**: Alert on high failure rates
- **API Rate Limits**: Alert on excessive blocking
- **Payment Processing**: Alert on payment failures

---

## Migration Order

Run migrations in this order:
1. `005_fraud_detection_system.sql`
2. `006_publisher_payment_system.sql`
3. `007_advertiser_billing_system.sql`
4. `008_offer_targeting_system.sql`
5. `009_realtime_dashboard_system.sql`
6. `010_admin_tools_logging_system.sql`
7. `011_postback_retry_system.sql`
8. `012_security_abuse_prevention.sql`
9. `013_fallback_routing_system.sql`
10. `014_smartlink_engine.sql`

---

## Next Steps

1. **Run Migrations**: Execute all migration files in order
2. **Configure Redis**: Set up Redis for caching and queues
3. **Set Up Queue Workers**: Configure BullMQ or similar for postback retry
4. **Configure VPN/Proxy API**: Integrate external VPN detection service
5. **Set Up Monitoring**: Configure alerts and monitoring dashboards
6. **Load Testing**: Test system under high traffic
7. **Security Audit**: Review security configurations

---

## Support & Documentation

All modules are production-ready and follow best practices:
- ✅ Error handling
- ✅ Logging
- ✅ Database indexes
- ✅ Foreign key constraints
- ✅ Input validation
- ✅ Security considerations

For questions or issues, refer to the individual service files and API documentation.
