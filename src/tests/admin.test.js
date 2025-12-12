import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify from 'fastify';
import adminRoutes from '../routes/admin.js';
import pool from '../db/connection.js';

describe('Admin API Tests', () => {
  let app;
  const authHeader = 'Basic ' + Buffer.from('admin@bng.com:admin123').toString('base64');
  
  beforeAll(async () => {
    app = Fastify();
    await app.register(adminRoutes, { prefix: '/api/admin' });
    await app.ready();
  });
  
  afterAll(async () => {
    await app.close();
    await pool.end();
  });
  
  describe('Publisher Management', () => {
    it('should create a publisher', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/publishers',
        headers: {
          authorization: authHeader,
        },
        payload: {
          email: 'test@publisher.com',
          first_name: 'Test',
          last_name: 'Publisher',
          company_name: 'Test Company',
          status: 'active',
        },
      });
      
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.email).toBe('test@publisher.com');
    });
    
    it('should list publishers', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/publishers',
        headers: {
          authorization: authHeader,
        },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });
  
  describe('Offer Management', () => {
    it('should create an offer', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/offers',
        headers: {
          authorization: authHeader,
        },
        payload: {
          name: 'Test Offer',
          category: 'CPA',
          advertiser_revenue: 10.00,
          affiliate_model_cost: 8.00,
          offer_url: 'https://example.com/offer',
          status: 'active',
        },
      });
      
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.data.name).toBe('Test Offer');
    });
    
    it('should list offers', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/offers/all',
        headers: {
          authorization: authHeader,
        },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(Array.isArray(body.data)).toBe(true);
    });
  });
  
  describe('Assignment Management', () => {
    let publisherId, offerId;
    
    beforeAll(async () => {
      // Create test publisher and offer
      const pubResult = await pool.query(
        "INSERT INTO publishers (email, status) VALUES ('assign@publisher.com', 'active') RETURNING id"
      );
      publisherId = pubResult.rows[0].id;
      
      const offerResult = await pool.query(
        "INSERT INTO offers (name, category, advertiser_revenue, affiliate_model_cost, offer_url, status, url_key) VALUES ('Assign Offer', 'CPA', 10, 8, 'https://example.com', 'active', 'assign-offer-123') RETURNING id"
      );
      offerId = offerResult.rows[0].id;
    });
    
    it('should create an assignment', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/assignments',
        headers: {
          authorization: authHeader,
        },
        payload: {
          publisher_id: publisherId,
          offer_id: offerId,
          payout_override: 9.00,
        },
      });
      
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });
});

