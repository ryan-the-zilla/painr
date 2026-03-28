import { createHash } from 'node:crypto';

const FREE_ANALYSIS_LIMIT = 3;
const THIRTY_DAYS = 60 * 60 * 24 * 30;

const kvAvailable = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);

async function getRedis() {
  if (!kvAvailable) return null;
  try {
    const { Redis } = await import('@upstash/redis');
    return Redis.fromEnv();
  } catch {
    return null;
  }
}

export function getFingerprint(ip: string, ua: string): string {
  return createHash('sha256').update(ip + '|' + ua).digest('hex').slice(0, 16);
}

export async function checkAndIncrementFreeUsage(fingerprint: string): Promise<{ allowed: boolean; remaining: number }> {
  const redis = await getRedis();
  if (!redis) return { allowed: true, remaining: FREE_ANALYSIS_LIMIT };

  try {
    const key = `usage:${fingerprint}`;
    const count = (await redis.get<number>(key)) ?? 0;

    if (count >= FREE_ANALYSIS_LIMIT) {
      return { allowed: false, remaining: 0 };
    }

    await redis.set(key, count + 1, { ex: THIRTY_DAYS });
    return { allowed: true, remaining: FREE_ANALYSIS_LIMIT - count - 1 };
  } catch {
    return { allowed: true, remaining: FREE_ANALYSIS_LIMIT };
  }
}
