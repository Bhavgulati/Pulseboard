const { redis } = require('../config/redis');

/**
 * SLIDING WINDOW RATE LIMITER using Redis
 * 
 * How it works:
 * - Every request gets stored in Redis as a sorted set
 * - Score = timestamp of request
 * - On each request we:
 *   1. Remove all requests older than the window
 *   2. Count remaining requests
 *   3. If count >= limit → block
 *   4. If count < limit → allow and add this request
 * 
 * Why sliding window over fixed window:
 * Fixed window: limit resets at :00 every minute
 * Problem: 100 requests at :59, 100 more at :01 = 200 in 2 seconds
 * Sliding window: always looks at last 60 seconds from NOW
 * No boundary exploitation possible
 */

const rateLimiter = (limit = 100, windowMs = 60000) => {
  return async (req, res, next) => {
    try {
      // Use IP + route as key
      // So each endpoint has its own limit per user
      const key = `rate_limit:${req.ip}:${req.path}`;
      const now = Date.now();
      const windowStart = now - windowMs;

      // Lua script — runs atomically in Redis
      // No race condition possible
      // This is what interviewers want to see
      const luaScript = `
        local key = KEYS[1]
        local now = tonumber(ARGV[1])
        local window_start = tonumber(ARGV[2])
        local limit = tonumber(ARGV[3])
        local request_id = ARGV[4]

        -- Remove requests outside the window
        redis.call('ZREMRANGEBYSCORE', key, 0, window_start)

        -- Count current requests in window
        local count = redis.call('ZCARD', key)

        -- If limit exceeded, return 0 (blocked)
        if count >= limit then
          return 0
        end

        -- Add this request with timestamp as score
        redis.call('ZADD', key, now, request_id)

        -- Set expiry on the key
        redis.call('EXPIRE', key, math.ceil(${windowMs} / 1000))

        -- Return remaining requests allowed
        return limit - count - 1
      `;

      const remaining = await redis.eval(
        luaScript,
        1,           // number of keys
        key,         // KEYS[1]
        now,         // ARGV[1]
        windowStart, // ARGV[2]
        limit,       // ARGV[3]
        `${now}-${Math.random()}` // ARGV[4] — unique request ID
      );

      // Set rate limit headers (like GitHub API does)
      res.setHeader('X-RateLimit-Limit', limit);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining));
      res.setHeader('X-RateLimit-Reset', new Date(now + windowMs).toISOString());

      if (remaining === 0 || remaining < 0) {
        return res.status(429).json({
          error: 'Too many requests',
          message: `Rate limit exceeded. Try again after ${windowMs / 1000} seconds`,
          retryAfter: Math.ceil(windowMs / 1000)
        });
      }

      next();

    } catch (error) {
      console.error('Rate limiter error:', error);
      // If Redis is down, let request through (fail open)
      // Better to serve than to block everyone
      next();
    }
  };
};

// Different limits for different routes
const authLimiter = rateLimiter(5, 60000);      // 5 requests per minute on auth
const apiLimiter = rateLimiter(100, 60000);     // 10000 requests per minute on API
const strictLimiter = rateLimiter(3, 60000);    // 3 requests per minute (sensitive)

module.exports = { rateLimiter, authLimiter, apiLimiter, strictLimiter };