# Authentication Setup Guide

## ✅ What's Been Added

### 1. Authentication APIs
- **POST /api/auth/register** - Register a new admin user
- **POST /api/auth/login** - Login and get JWT token
- **GET /api/auth/profile** - Get current admin profile (protected)

### 2. JWT Token Authentication
- All admin endpoints now use JWT Bearer tokens
- Tokens expire after 7 days (configurable via `JWT_EXPIRES_IN`)
- Token is automatically saved in Postman after login/register

### 3. Updated Postman Collection
- Added Authentication folder with register, login, and profile endpoints
- Automatic token handling - token is saved after login/register
- All admin endpoints automatically use the saved token
- No need to manually add tokens!

## 🚀 How to Use

### Step 1: Install Dependencies
```bash
npm install
```

This will install `jsonwebtoken` package.

### Step 2: Set Environment Variables
Make sure your `.env` file has:
```env
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d
```

### Step 3: Register or Login

#### Option A: Register New Admin
```bash
POST /api/auth/register
{
  "email": "admin@bng.com",
  "name": "Admin User",
  "password": "admin123",
  "role": "admin"
}
```

#### Option B: Login (if admin already exists)
```bash
POST /api/auth/login
{
  "email": "admin@bng.com",
  "password": "admin123"
}
```

Both endpoints return:
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "id": 1,
    "email": "admin@bng.com",
    "name": "Admin User",
    "role": "admin",
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Step 4: Use Protected Endpoints
All admin endpoints now require Bearer token:
```
Authorization: Bearer <your-token>
```

## 📮 Postman Collection Usage

### Automatic Token Handling

1. **Import the Collection** - Import `BNG_MIS_Reporting_Portal.postman_collection.json`

2. **Login First** - Run the "Login" request in the Authentication folder
   - The token is automatically saved to collection variable `auth_token`
   - You'll see "Token saved" in the console

3. **Use Any Admin Endpoint** - All admin endpoints automatically use the saved token
   - No need to manually add the token!
   - The token is sent automatically via Bearer authentication

### Manual Token Usage (if needed)

If you want to manually set the token:
1. Go to Collection Variables
2. Set `auth_token` variable with your JWT token
3. All requests will use it automatically

## 🔐 Security Notes

1. **Change JWT_SECRET** in production
2. **Use strong passwords** for admin accounts
3. **Tokens expire** after 7 days (configurable)
4. **HTTPS** should be used in production

## 📝 API Endpoints

### Register Admin
```
POST /api/auth/register
Content-Type: application/json

{
  "email": "admin@example.com",
  "name": "Admin Name",
  "password": "securepassword",
  "role": "admin"  // optional, defaults to "admin"
}
```

### Login
```
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "securepassword"
}
```

### Get Profile (Protected)
```
GET /api/auth/profile
Authorization: Bearer <token>
```

## 🐛 Troubleshooting

### Token Not Working
- Make sure you ran Login/Register first
- Check that `auth_token` variable is set in Postman
- Verify token hasn't expired (7 days default)

### Authentication Errors
- Check JWT_SECRET is set in .env
- Verify email/password are correct
- Ensure admin user exists in database

### MySQL Connection Issues
- Make sure MySQL is running
- Check database credentials in .env
- Run migrations: `npm run migrate`

## ✅ What Changed

1. ✅ Added JWT authentication
2. ✅ Created register/login endpoints
3. ✅ Updated auth middleware to use JWT
4. ✅ Updated Postman collection with automatic token handling
5. ✅ All admin endpoints now use Bearer tokens

The system is now ready to use with JWT authentication!

