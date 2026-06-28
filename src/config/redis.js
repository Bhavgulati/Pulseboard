const Redis = require('ioredis');

const createRedisClient = (extra = {}) => {
  if (process.env.REDIS_URL) {
    return new Redis(process.env.REDIS_URL, extra);
  }
  return new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    ...extra
  });
};

const redis = createRedisClient();
const bullMQRedis = createRedisClient({ maxRetriesPerRequest: null });

redis.on('connect', () => console.log('Connected to Redis'));
redis.on('error', (err) => console.error('Redis error:', err));

module.exports = { redis, bullMQRedis };