# BNG MIS Reporting Portal - Backend

Complete backend system for BNG MIS Reporting Portal with admin CRUD, tracking, postback, and reporting capabilities.

## 🚀 Features

- **Admin Management**: Create and manage publishers, offers, and assignments
- **Click Tracking**: Track clicks with full device and location data
- **Impression Tracking**: Track ad impressions
- **Postback Processing**: Server-to-server conversion tracking with deduplication
- **Comprehensive Reporting**: Summary and detailed reports with extensive filtering
- **Dashboard**: Real-time metrics and statistics
- **Test Conversion Tool**: Test conversion flow

## 📋 Prerequisites

- Node.js 20+
- PostgreSQL 16+
- npm or yarn

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd Pulpy_Reporting_Portal
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your configuration:
   ```env
   PORT=3000
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=pulpy_reporting
   DB_USER=postgres
   DB_PASSWORD=postgres
   BASE_URL=http://localhost:3000
   TRACKING_DOMAIN=http://localhost:3000
   ```

4. **Run database migrations**
   ```bash
   npm run migrate
   ```

5. **Start the server**
   ```bash
   npm start
   # or for development with auto-reload
   npm run dev
   ```

## 🐳 Docker Setup

1. **Start services with Docker Compose**
   ```bash
   docker-compose up -d
   ```

2. **Run migrations**
   ```bash
   docker-compose exec backend npm run migrate
   ```

## 📚 API Documentation

### Authentication

All admin endpoints require Basic Authentication:
```
Authorization: Basic base64(email:password)
```

Default admin credentials:
- Email: `admin@bng.com`
- Password: `admin123`

**⚠️ Change the default password in production!**

### Admin APIs

#### 1. Create Publisher

```bash
curl -X POST http://localhost:3000/api/admin/publishers \
  -H "Authorization: Basic $(echo -n 'admin@bng.com:admin123' | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "publisher@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "company_name": "Example Company",
    "status": "active"
  }'
```

#### 2. Create Offer

```bash
curl -X POST http://localhost:3000/api/admin/offers \
  -H "Authorization: Basic $(echo -n 'admin@bng.com:admin123' | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Offer",
    "category": "CPA",
    "advertiser_revenue": 10.00,
    "affiliate_model_cost": 8.00,
    "offer_url": "https://example.com/offer",
    "capping_per_day": 1000,
    "status": "active"
  }'
```

#### 3. List Offers

```bash
# All offers
curl http://localhost:3000/api/admin/offers/all \
  -H "Authorization: Basic $(echo -n 'admin@bng.com:admin123' | base64)"

# Live offers
curl http://localhost:3000/api/admin/offers/live \
  -H "Authorization: Basic $(echo -n 'admin@bng.com:admin123' | base64)"

# Approved offers
curl http://localhost:3000/api/admin/offers/approved \
  -H "Authorization: Basic $(echo -n 'admin@bng.com:admin123' | base64)"
```

#### 4. Update Offer Status

```bash
curl -X PATCH http://localhost:3000/api/admin/offers/1/status \
  -H "Authorization: Basic $(echo -n 'admin@bng.com:admin123' | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "deactivate"
  }'
```

#### 5. Assign Offer to Publisher

```bash
curl -X POST http://localhost:3000/api/admin/assignments \
  -H "Authorization: Basic $(echo -n 'admin@bng.com:admin123' | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "publisher_id": 1,
    "offer_id": 1,
    "payout_override": 9.00,
    "cap_override": 500
  }'
```

#### 6. Generate Tracking URL

```bash
curl http://localhost:3000/api/admin/assignments/1/tracking-url \
  -H "Authorization: Basic $(echo -n 'admin@bng.com:admin123' | base64)"
```

Response:
```json
{
  "success": true,
  "data": {
    "tracking_url": "http://localhost:3000/click?offer_id=1&pub_id=1&tid={TID}"
  }
}
```

#### 7. Test Conversion

```bash
curl -X POST http://localhost:3000/api/admin/test-conversion \
  -H "Authorization: Basic $(echo -n 'admin@bng.com:admin123' | base64)" \
  -H "Content-Type: application/json" \
  -d '{
    "affiliate_url": "http://localhost:3000/click?offer_id=1&pub_id=1&tid=test123"
  }'
```

### Tracking APIs

#### 1. Click Tracking

```bash
curl -L "http://localhost:3000/click?offer_id=1&pub_id=1&tid=test123&rcid=rcid123&source_id=src1"
```

This will:
- Validate offer and publisher
- Check capping
- Record click with device/location data
- Redirect to offer URL with click parameters

#### 2. Impression Tracking

```bash
curl "http://localhost:3000/imp?offer_id=1&pub_id=1"
```

Returns a 1x1 pixel GIF.

### Postback API

#### Process Conversion (GET)

```bash
curl "http://localhost:3000/postback?click_id=<click_uuid>&rcid=rcid123&amount=10.00&status=approved"
```

#### Process Conversion (POST)

```bash
curl -X POST http://localhost:3000/postback \
  -H "Content-Type: application/json" \
  -d '{
    "click_id": "<click_uuid>",
    "rcid": "rcid123",
    "amount": 10.00,
    "status": "approved"
  }'
```

**Note**: Conversions are deduplicated based on `rcid + offer_id` combination.

### Reporting APIs

#### 1. Dashboard Stats

```bash
curl http://localhost:3000/api/admin/reports/dashboard \
  -H "Authorization: Basic $(echo -n 'admin@bng.com:admin123' | base64)"
```

Response:
```json
{
  "success": true,
  "data": {
    "impressions": { "total": 1000 },
    "clicks": { "total": 500, "unique": 450 },
    "conversions": { "total": 50, "approved": 45, "conversion_rate": 10.0 },
    "revenue": { "total": 500.00, "payout": 360.00, "profit": 140.00 },
    "offers": { "total": 10, "active": 8 },
    "publishers": { "total": 20, "active": 15, "pending": 5 }
  }
}
```

#### 2. Summary Report

```bash
curl "http://localhost:3000/api/admin/reports/summary?date_from=2024-01-01&date_to=2024-01-31&offer_id=1" \
  -H "Authorization: Basic $(echo -n 'admin@bng.com:admin123' | base64)"
```

#### 3. Detailed Report

```bash
curl "http://localhost:3000/api/admin/reports/detailed?date_from=2024-01-01&offer_id=1&page=1&limit=50" \
  -H "Authorization: Basic $(echo -n 'admin@bng.com:admin123' | base64)"
```

**Available Filters:**
- `date_from`, `date_to`: Date range
- `offer_id`, `publisher_id`: Filter by offer/publisher
- `country`, `ip`: Location filters
- `tid`, `rcid`: Tracking IDs
- `device_brand`, `os`, `browser`: Device filters
- `referrer`: Referrer filter
- `source_id`, `google_id`, `android_id`: ID filters
- `hour`: Hour of day (0-23)
- `page`, `limit`: Pagination

## 🗄️ Database Schema

### Tables

1. **admin_users**: Admin user accounts
2. **publishers**: Affiliate/publisher information
3. **offers**: Campaign/offer details
4. **publisher_offers**: Assignments between publishers and offers
5. **clicks**: Click tracking data
6. **impressions**: Impression tracking data
7. **conversions**: Conversion records
8. **daily_offer_stats**: Aggregated daily statistics

See `src/db/migrations/001_initial_schema.sql` for complete schema.

## 🧪 Testing

Run tests:
```bash
npm test
```

Run tests in watch mode:
```bash
npm run test:watch
```

## 📁 Project Structure

```
backend/
├── src/
│   ├── server.js              # Main server file
│   ├── routes/                # API routes
│   │   ├── admin.js
│   │   ├── tracking.js
│   │   ├── postback.js
│   │   └── reports.js
│   ├── controllers/           # Request handlers
│   │   ├── adminController.js
│   │   ├── trackingController.js
│   │   ├── postbackController.js
│   │   ├── reportController.js
│   │   └── dashboardController.js
│   ├── services/              # Business logic
│   │   ├── publisherService.js
│   │   ├── offerService.js
│   │   ├── assignmentService.js
│   │   ├── trackingService.js
│   │   ├── postbackService.js
│   │   ├── reportService.js
│   │   └── dashboardService.js
│   ├── validators/            # Request validation schemas
│   │   ├── publisherValidator.js
│   │   ├── offerValidator.js
│   │   ├── assignmentValidator.js
│   │   ├── trackingValidator.js
│   │   └── reportValidator.js
│   ├── middleware/            # Middleware functions
│   │   ├── auth.js
│   │   ├── errorHandler.js
│   │   └── requestLogger.js
│   ├── utils/                 # Utility functions
│   │   ├── logger.js
│   │   ├── deviceParser.js
│   │   ├── ipExtractor.js
│   │   ├── countryLookup.js
│   │   └── urlGenerator.js
│   ├── db/                    # Database
│   │   ├── connection.js
│   │   ├── migrate.js
│   │   └── migrations/
│   └── tests/                 # Test files
├── package.json
├── docker-compose.yml
├── Dockerfile
└── README.md
```

## 🔒 Security Notes

1. **Change default admin password** in production
2. Use environment variables for sensitive data
3. Implement rate limiting (already included)
4. Use HTTPS in production
5. Consider implementing JWT tokens instead of Basic Auth for production

## 📝 Business Logic Rules

### Offer Status Behavior
- `pending`: Cannot receive clicks
- `active`: Accepts clicks normally
- `deactivate`: Clicks redirect to `fallback_url`
- `remove`: Not shown in UI

### Capping Logic
- If `capping_per_day` reached → redirect to `fallback_url`
- If `cap_override` exists on assignment → use per-publisher cap
- Capping is checked per day (resets at midnight)

### Conversion Deduplication
- Conversions are deduplicated using `UNIQUE(rcid, offer_id)`
- Same `rcid` + `offer_id` combination will not create duplicate conversions

## 🐛 Troubleshooting

### Database Connection Issues
- Verify PostgreSQL is running
- Check database credentials in `.env`
- Ensure database exists: `CREATE DATABASE pulpy_reporting;`

### Migration Issues
- Run migrations: `npm run migrate`
- Check PostgreSQL logs for errors

### Port Already in Use
- Change `PORT` in `.env`
- Or kill the process using the port

## 📄 License

ISC

## 👥 Support

For issues and questions, please contact the development team.

#   P u l p y _ R e p o r t i n g _ P o r t a l  
 