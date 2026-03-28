import { createHash } from 'crypto';

const FREE_ANALYSIS_LIMIT = 3;
const THIRTY_DAYS = 60 * 60 * 24 * 30;

const kvAvailable = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

async function getKV() {
  if (!kvAvailable) return null;
  try {
    const { kv } = await import('@vercel/kv');
    return kv;
  } catch {
    return null;
  }
}

export function getFingerprint(ip: string, ua: string): string {
  return createHash('sha256').update(ip + '|' + ua).digest('hex').slice(0, 16);
}

export async function checkAndIncrementFreeUsage(fingerprint: string): Promise<{ allowed: boolean; remaining: number }> {
  const kv = await getKV();
  if (!kv) return { allowed: true, remaining: FREE_ANALYSIS_LIMIT };

  try {
    const key = `usage:${fingerprint}`;
    const count = (await kv.get<number>(key)) ?? 0;

    if (count >= FREE_ANALYSIS_LIMIT) {
      return { allowed: false, remaining: 0 };
    }

    await kv.set(key, count + 1, { ex: THIRTY_DAYS });
    return { allowed: true, remaining: FREE_ANALYSIS_LIMIT - count - 1 };
  } catch {
    return { allowed: true, remaining: FREE_ANALYSIS_LIMIT };
  }
}
