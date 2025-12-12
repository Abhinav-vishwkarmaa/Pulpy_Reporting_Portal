# Setup Guide

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Environment**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your database credentials.

3. **Start PostgreSQL**
   - Using Docker: `docker-compose up -d postgres`
   - Or use your local PostgreSQL instance

4. **Run Migrations**
   ```bash
   npm run migrate
   ```

5. **Start Server**
   ```bash
   npm start
   ```

## Default Admin Credentials

- **Email**: `admin@bng.com`
- **Password**: `admin123`

**⚠️ IMPORTANT**: Change the default password in production!

To generate a new password hash:
```bash
node scripts/generate-admin-hash.js your-new-password
```

## Database Setup

### Manual Setup

1. Create database:
   ```sql
   CREATE DATABASE pulpy_reporting;
   ```

2. Run migrations:
   ```bash
   npm run migrate
   ```

### Using Docker

```bash
docker-compose up -d
```

This will start both PostgreSQL and the backend service.

## Testing

Run tests:
```bash
npm test
```

## Postman Collection

Import `BNG_MIS_Reporting_Portal.postman_collection.json` into Postman.

Set the `base_url` variable to your server URL (default: `http://localhost:3000`).

## API Endpoints

See `README.md` for complete API documentation.

## Troubleshooting

### Database Connection Error
- Verify PostgreSQL is running
- Check `.env` file has correct credentials
- Ensure database exists

### Port Already in Use
- Change `PORT` in `.env`
- Or kill the process: `lsof -ti:3000 | xargs kill` (Mac/Linux)

### Migration Errors
- Ensure PostgreSQL is running
- Check database user has CREATE privileges
- Drop and recreate database if needed

