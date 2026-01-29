import { redis } from './redis';

const RATE_LIMIT_PREFIX = 'rate_limit:';

/**
 * Redis-based Fixed Window Rate Limiter
 * @param provider 식별자 (예: 'OPENDART')
 * @param limit 윈도우 내 최대 허용 요청 수
 * @param windowSeconds 윈도우 크기 (초)
 */
export async function checkRateLimit(provider: string, limit: number, windowSeconds: number) {
  const key = `${RATE_LIMIT_PREFIX}${provider}`;
  const current = await redis.incr(key);

  if (current === 1) {
    await redis.expire(key, windowSeconds);
  }

  if (current > limit) {
    const ttl = await redis.ttl(key);
    throw new Error(`Rate limit exceeded for ${provider}. Retry after ${ttl} seconds.`);
  }
}