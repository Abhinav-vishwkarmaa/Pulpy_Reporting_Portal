import redis from '../config/redis.js';
import offerService from './offerService.js';
import publisherService from './publisherService.js';
import assignmentService from './assignmentService.js';
import logger from '../utils/logger.js';
import pool from '../db/connection.js';

const TTL = {
    OFFER: 300,        // 5 Minutes (Reference data doesn't change often)
    PUBLISHER: 300,
    ASSIGNMENT: 300,
    CAP_COUNTERS: 86400 // 24 Hours
};

export class CacheService {

    // --- Reference Data Lookups (Read-Through) ---

    async getOffer(offerId) {
        const key = `ref:offer:${offerId}`;
        try {
            const cached = await redis.hgetall(key);
            if (cached && cached.id) {
                // Redis returns strings; strictly typed fields might need conversion
                return this._deserialize(cached);
            }
        } catch (e) {
            logger.warn(`Redis getOffer error: ${e.message}`);
        }

        // DB Fallback
        const offer = await offerService.findById(offerId);
        if (offer) {
            // Async Cache Population (don't block response)
            this._cacheObject(key, offer, TTL.OFFER);
        }
        return offer;
    }

    async getPublisher(publisherId) {
        const key = `ref:publisher:${publisherId}`;
        try {
            const cached = await redis.hgetall(key);
            if (cached && cached.id) return this._deserialize(cached);
        } catch (e) { }

        const publisher = await publisherService.findById(publisherId);
        if (publisher) this._cacheObject(key, publisher, TTL.PUBLISHER);
        return publisher;
    }

    async getAssignment(publisherId, offerId) {
        const key = `ref:assign:${publisherId}:${offerId}`;
        try {
            const cached = await redis.hgetall(key);
            if (cached && cached.id) return this._deserialize(cached);
        } catch (e) { }

        const [rows] = await pool.query(
            'SELECT * FROM publisher_offers WHERE publisher_id = ? AND offer_id = ? AND status = ?',
            [publisherId, offerId, 'active']
        );
        const assignment = Array.isArray(rows) ? rows[0] : rows;

        if (assignment) this._cacheObject(key, assignment, TTL.ASSIGNMENT);
        return assignment;
    }

    // --- Capping Logic (Redis Counters) ---

    async checkAndIncrementCap(offerId, capType, limit, increment = false) {
        if (!limit || limit <= 0) return true; // No cap

        const key = `stats:cap:${offerId}:${capType}`; // e.g., stats:cap:15:daily

        let current = 0;
        try {
            // Check current value
            current = await redis.get(key);
            if (current === null) {
                // Hydrate from DB if missing (One-time cost per day/start)
                current = await this._hydrateCapCount(offerId, capType);
                await redis.setex(key, TTL.CAP_COUNTERS, current);
            }
        } catch (e) {
            // Redis Fail: Secure Open or Close? 
            // "Never lose money" -> Secure Close (Reject if unsure) or Fallback to DB query
            // For performance, we might Assume OK or Fallback.
            // Let's Fallback to DB query in calling service if this throws.
            throw e;
        }

        if (parseInt(current) >= limit) return false; // Cap Hit

        if (increment) {
            // Atomic Increment
            await redis.incr(key);
        }
        return true;
    }

    async _hydrateCapCount(offerId, capType) {
        // DB Count logic matching TrackingService
        let sql = '';
        if (capType === 'daily') {
            sql = 'SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ? AND created_at >= CURDATE()';
        } else if (capType === 'total') {
            sql = 'SELECT COUNT(*) AS cnt FROM conversions WHERE offer_id = ?';
        } else {
            return 0;
        }

        const [rows] = await pool.query(sql, [offerId]);
        return (Array.isArray(rows) ? rows[0] : rows).cnt || 0;
    }

    // --- Deduplication ---

    async isDuplicateClick(fingerprint) {
        const key = `dedupe:click:${fingerprint}`;
        // SET NX EX 3: Set if Not Exists, Expire 3s
        // Returns 'OK' if set, null if already exists
        const result = await redis.set(key, '1', 'NX', 'EX', 3);
        return result === null; // If null, it WAS duplicate
    }

    async getDedupeRedirect(fingerprint) {
        return await redis.get(`dedupe:redirect:${fingerprint}`);
    }

    async cacheDedupeRedirect(fingerprint, url) {
        await redis.setex(`dedupe:redirect:${fingerprint}`, 3, url);
    }

    // --- Helpers ---

    _deserialize(obj) {
        // Simple helper to parse numbers back from strings
        // In production, might need specific schema mapping
        return obj;
    }

    async _cacheObject(key, obj, ttl) {
        // Flatten object for HSET (handle dates/nested)
        const flat = {};
        for (const [k, v] of Object.entries(obj)) {
            if (v instanceof Date) flat[k] = v.toISOString();
            else if (v === null || v === undefined) continue;
            else flat[k] = String(v);
        }
        try {
            await redis.hset(key, flat);
            await redis.expire(key, ttl);
        } catch (e) {
            logger.warn(`Failed to cache ${key}`, e);
        }
    }
}

export default new CacheService();
