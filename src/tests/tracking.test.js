import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import Fastify from 'fastify';
import trackingRoutes from '../routes/tracking.js';
import pool from '../db/connection.js';

describe('Tracking API Tests', () => {
  let app;
  let publisherId, offerId;
  
  beforeAll(async () => {
    app = Fastify();
    await app.register(trackingRoutes);
    await app.ready();
    
    // Create test publisher and offer
    const pubResult = await pool.query(
      "INSERT INTO publishers (email, status) VALUES ('track@publisher.com', 'active') RETURNING id"
    );
    publisherId = pubResult.rows[0].id;
    
    const offerResult = await pool.query(
      "INSERT INTO offers (name, category, advertiser_revenue, affiliate_model_cost, offer_url, status, url_key) VALUES ('Track Offer', 'CPA', 10, 8, 'https://example.com/offer', 'active', 'track-offer-123') RETURNING id"
    );
    offerId = offerResult.rows[0].id;
  });
  
  afterAll(async () => {
    await app.close();
    // Cleanup
    await pool.query('DELETE FROM clicks WHERE offer_id = $1', [offerId]);
    await pool.query('DELETE FROM impressions WHERE offer_id = $1', [offerId]);
    await pool.query('DELETE FROM publisher_offers WHERE offer_id = $1', [offerId]);
    await pool.query('DELETE FROM offers WHERE id = $1', [offerId]);
    await pool.query('DELETE FROM publishers WHERE id = $1', [publisherId]);
    await pool.end();
  });
  
  it('should track a click', async () => {
    // Create assignment first
    await pool.query(
      'INSERT INTO publisher_offers (publisher_id, offer_id, status) VALUES ($1, $2, $3)',
      [publisherId, offerId, 'active']
    );
    
    const response = await app.inject({
      method: 'GET',
      url: `/click?offer_id=${offerId}&pub_id=${publisherId}&tid=test123`,
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });
    
    expect([302, 301]).toContain(response.statusCode);
    expect(response.headers.location).toContain('example.com');
  });
  
  it('should track an impression', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/imp?offer_id=${offerId}&pub_id=${publisherId}`,
    });
    
    expect(response.statusCode).toBe(200);
    
    // Verify impression was recorded
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM impressions WHERE offer_id = $1 AND publisher_id = $2',
      [offerId, publisherId]
    );
    expect(parseInt(result.rows[0].count)).toBeGreaterThan(0);
  });
});

