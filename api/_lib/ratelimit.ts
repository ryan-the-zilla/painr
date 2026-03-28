import { kv } from '@vercel/kv';

const FREE_ANALYSIS_LIMIT = 3;
const THIRTY_DAYS = 60 * 60 * 24 * 30;

export async function getFingerprint(ip: string, ua: string): Promise<string> {
  const data = new TextEncoder().encode(ip + '|' + ua);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function checkAndIncrementFreeUsage(fingerprint: string): Promise<{ allowed: boolean; remaining: number }> {
  const key = `usage:${fingerprint}`;
  const count = (await kv.get<number>(key)) ?? 0;

  if (count >= FREE_ANALYSIS_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  await kv.set(key, count + 1, { ex: THIRTY_DAYS });
  return { allowed: true, remaining: FREE_ANALYSIS_LIMIT - count - 1 };
}

export async function getFreeUsageCount(fingerprint: string): Promise<number> {
  return (await kv.get<number>(`usage:${fingerprint}`)) ?? 0;
}
