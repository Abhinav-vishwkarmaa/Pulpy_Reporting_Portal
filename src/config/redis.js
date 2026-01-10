import Redis from 'ioredis';
import dotenv from 'dotenv';
import logger from '../utils/logger.js';

dotenv.config();

const redisConfig = {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    },
    maxRetriesPerRequest: null, // Required for streams blocking reads
};

const redis = new Redis(redisConfig);

redis.on('connect', () => {
    logger.info('✅ Redis Connected');
});

redis.on('error', (err) => {
    logger.error('❌ Redis Connection Error:', err);
});

export default redis;
