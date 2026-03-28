import { createHash } from 'crypto';

const FREE_ANALYSIS_LIMIT = 3;
const THIRTY_DAYS = 60 * 60 * 24 * 30;

// In-memory fallback (resets on cold start — good enough for serverless rate limiting)
const memoryStore = new Map<string, { count: number; expires: number }>();

export function getFingerprint(ip: string, ua: string): string {
  return createHash('sha256').update(ip + '|' + ua).digest('hex').slice(0, 16);
}

async function getKV(): Promise<{ get: (k: string) => Promise<number | null>; set: (k: string, v: number, opts: { ex: number }) => Promise<void> } | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  // Minimal Upstash REST API client (no npm package needed)
  return {
    async get(key: string) {
      const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json() as { result: string | null };
      return data.result != null ? Number(data.result) : null;
    },
    async set(key: string, value: number, opts: { ex: number }) {
      await fetch(`${url}/set/${encodeURIComponent(key)}/${value}/ex/${opts.ex}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
    },
  };
}

export async function checkAndIncrementFreeUsage(fingerprint: string): Promise<{ allowed: boolean; remaining: number }> {
  try {
    const kv = await getKV();

    if (kv) {
      const key = `usage:${fingerprint}`;
      const count = (await kv.get(key)) ?? 0;
      if (count >= FREE_ANALYSIS_LIMIT) return { allowed: false, remaining: 0 };
      await kv.set(key, count + 1, { ex: THIRTY_DAYS });
      return { allowed: true, remaining: FREE_ANALYSIS_LIMIT - count - 1 };
    }

    // In-memory fallback
    const now = Date.now();
    const entry = memoryStore.get(fingerprint);
    if (entry && entry.expires > now) {
      if (entry.count >= FREE_ANALYSIS_LIMIT) return { allowed: false, remaining: 0 };
      entry.count++;
      return { allowed: true, remaining: FREE_ANALYSIS_LIMIT - entry.count };
    }
    memoryStore.set(fingerprint, { count: 1, expires: now + THIRTY_DAYS * 1000 });
    return { allowed: true, remaining: FREE_ANALYSIS_LIMIT - 1 };
  } catch {
    return { allowed: true, remaining: FREE_ANALYSIS_LIMIT };
  }
}
