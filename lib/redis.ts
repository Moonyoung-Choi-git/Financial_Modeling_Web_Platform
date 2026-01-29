import Redis from 'ioredis';

const getRedisUrl = () => {
  if (process.env.REDIS_URL) {
    return process.env.REDIS_URL;
  }
  const host = process.env.REDIS_HOST || 'localhost';
  const port = process.env.REDIS_PORT || '6379';
  return `redis://${host}:${port}`;
};

const globalForRedis = global as unknown as { redis: Redis };

export const redis =
  globalForRedis.redis ||
  new Redis(getRedisUrl(), {
    maxRetriesPerRequest: null, // Required for BullMQ
  });

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis;