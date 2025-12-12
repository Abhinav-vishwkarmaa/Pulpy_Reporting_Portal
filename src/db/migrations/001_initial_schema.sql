-- BNG MIS Reporting Portal - Initial Database Schema
-- PostgreSQL DDL

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Admin Users Table
CREATE TABLE IF NOT EXISTS admin_users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Publishers (Affiliates) Table
CREATE TABLE IF NOT EXISTS publishers (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    mobile VARCHAR(50),
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    company_name VARCHAR(255),
    position VARCHAR(100),
    address TEXT,
    state VARCHAR(100),
    country VARCHAR(100),
    zip_code VARCHAR(20),
    tax_invoice_details JSONB,
    payment_terms JSONB,
    global_postback_url TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'suspended')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_publishers_status ON publishers(status);
CREATE INDEX idx_publishers_email ON publishers(email);

-- 3. Offers (Campaigns) Table
CREATE TABLE IF NOT EXISTS offers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    category VARCHAR(10) NOT NULL CHECK (category IN ('CPA', 'CPI', 'CPM')),
    advertiser_revenue DECIMAL(10, 2) NOT NULL,
    affiliate_model_cost DECIMAL(10, 2) NOT NULL,
    start_at TIMESTAMP,
    end_at TIMESTAMP,
    offer_url TEXT NOT NULL,
    capping_per_day INTEGER DEFAULT 0,
    fallback_url TEXT,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'deactivate', 'remove')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    url_key VARCHAR(50) UNIQUE NOT NULL
);

CREATE INDEX idx_offers_status ON offers(status);
CREATE INDEX idx_offers_category ON offers(category);
CREATE INDEX idx_offers_url_key ON offers(url_key);
CREATE INDEX idx_offers_dates ON offers(start_at, end_at);

-- 4. Publisher Offers (Assignments) Table
CREATE TABLE IF NOT EXISTS publisher_offers (
    id SERIAL PRIMARY KEY,
    publisher_id INTEGER NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
    offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
    payout_override DECIMAL(10, 2),
    cap_override INTEGER,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT,
    UNIQUE(publisher_id, offer_id)
);

CREATE INDEX idx_publisher_offers_publisher ON publisher_offers(publisher_id);
CREATE INDEX idx_publisher_offers_offer ON publisher_offers(offer_id);
CREATE INDEX idx_publisher_offers_status ON publisher_offers(status);

-- 5. Clicks Table
CREATE TABLE IF NOT EXISTS clicks (
    id SERIAL PRIMARY KEY,
    click_uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
    publisher_id INTEGER NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
    publisher_offer_id INTEGER REFERENCES publisher_offers(id) ON DELETE SET NULL,
    ip VARCHAR(45),
    user_agent TEXT,
    referrer TEXT,
    country VARCHAR(100),
    region VARCHAR(100),
    city VARCHAR(100),
    isp VARCHAR(255),
    location JSONB,
    domain VARCHAR(255),
    device_type VARCHAR(50),
    browser VARCHAR(100),
    os VARCHAR(100),
    os_version VARCHAR(50),
    device_brand VARCHAR(100),
    device_model VARCHAR(100),
    source_id VARCHAR(255),
    device_id VARCHAR(255),
    google_id VARCHAR(255),
    android_id VARCHAR(255),
    rcid VARCHAR(255),
    tid VARCHAR(255),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_clicks_offer ON clicks(offer_id);
CREATE INDEX idx_clicks_publisher ON clicks(publisher_id);
CREATE INDEX idx_clicks_timestamp ON clicks(timestamp);
CREATE INDEX idx_clicks_rcid ON clicks(rcid);
CREATE INDEX idx_clicks_tid ON clicks(tid);
CREATE INDEX idx_clicks_click_uuid ON clicks(click_uuid);
CREATE INDEX idx_clicks_country ON clicks(country);
CREATE INDEX idx_clicks_device_type ON clicks(device_type);
CREATE INDEX idx_clicks_created_at ON clicks(created_at);

-- 6. Impressions Table
CREATE TABLE IF NOT EXISTS impressions (
    id SERIAL PRIMARY KEY,
    imp_uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
    publisher_id INTEGER NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
    ip VARCHAR(45),
    user_agent TEXT,
    referrer TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_impressions_offer ON impressions(offer_id);
CREATE INDEX idx_impressions_publisher ON impressions(publisher_id);
CREATE INDEX idx_impressions_timestamp ON impressions(timestamp);
CREATE INDEX idx_impressions_created_at ON impressions(created_at);

-- 7. Conversions Table
CREATE TABLE IF NOT EXISTS conversions (
    id SERIAL PRIMARY KEY,
    conversion_uuid UUID DEFAULT uuid_generate_v4() UNIQUE NOT NULL,
    click_uuid UUID REFERENCES clicks(click_uuid) ON DELETE SET NULL,
    offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
    publisher_id INTEGER NOT NULL REFERENCES publishers(id) ON DELETE CASCADE,
    publisher_offer_id INTEGER REFERENCES publisher_offers(id) ON DELETE SET NULL,
    rcid VARCHAR(255) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    amount DECIMAL(10, 2) NOT NULL,
    payout DECIMAL(10, 2) NOT NULL,
    ip VARCHAR(45),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    postback_payload JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(rcid, offer_id)
);

CREATE INDEX idx_conversions_offer ON conversions(offer_id);
CREATE INDEX idx_conversions_publisher ON conversions(publisher_id);
CREATE INDEX idx_conversions_rcid ON conversions(rcid);
CREATE INDEX idx_conversions_click_uuid ON conversions(click_uuid);
CREATE INDEX idx_conversions_status ON conversions(status);
CREATE INDEX idx_conversions_timestamp ON conversions(timestamp);
CREATE INDEX idx_conversions_created_at ON conversions(created_at);

-- 8. Daily Offer Stats Table (for dashboard summarization)
CREATE TABLE IF NOT EXISTS daily_offer_stats (
    id SERIAL PRIMARY KEY,
    offer_id INTEGER NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
    day DATE NOT NULL,
    impressions INTEGER DEFAULT 0,
    clicks INTEGER DEFAULT 0,
    unique_clicks INTEGER DEFAULT 0,
    conversions INTEGER DEFAULT 0,
    revenue DECIMAL(10, 2) DEFAULT 0,
    payout DECIMAL(10, 2) DEFAULT 0,
    profit DECIMAL(10, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(offer_id, day)
);

CREATE INDEX idx_daily_stats_offer ON daily_offer_stats(offer_id);
CREATE INDEX idx_daily_stats_day ON daily_offer_stats(day);
CREATE INDEX idx_daily_stats_offer_day ON daily_offer_stats(offer_id, day);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_admin_users_updated_at BEFORE UPDATE ON admin_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_publishers_updated_at BEFORE UPDATE ON publishers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_offers_updated_at BEFORE UPDATE ON offers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversions_updated_at BEFORE UPDATE ON conversions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_daily_offer_stats_updated_at BEFORE UPDATE ON daily_offer_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default admin user (password: admin123 - change in production!)
-- Password hash for 'admin123' using bcrypt (10 rounds)
-- To generate new hash: node -e "const bcrypt = require('bcrypt'); bcrypt.hash('admin123', 10).then(hash => console.log(hash));"
INSERT INTO admin_users (email, name, password_hash, role) 
VALUES ('admin@bng.com', 'Admin User', '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'admin')
ON CONFLICT (email) DO NOTHING;

