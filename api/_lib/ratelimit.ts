const FREE_ANALYSIS_LIMIT = 3;
const THIRTY_DAYS = 60 * 60 * 24 * 30;

const kvAvailable = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);

async function getKV() {
  if (!kvAvailable) return null;
  const { kv } = await import('@vercel/kv');
  return kv;
}

export async function getFingerprint(ip: string, ua: string): Promise<string> {
  const data = new TextEncoder().encode(ip + '|' + ua);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function checkAndIncrementFreeUsage(fingerprint: string): Promise<{ allowed: boolean; remaining: number }> {
  const kv = await getKV();
  if (!kv) return { allowed: true, remaining: FREE_ANALYSIS_LIMIT };

  const key = `usage:${fingerprint}`;
  const count = (await kv.get<number>(key)) ?? 0;

  if (count >= FREE_ANALYSIS_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  await kv.set(key, count + 1, { ex: THIRTY_DAYS });
  return { allowed: true, remaining: FREE_ANALYSIS_LIMIT - count - 1 };
}

export async function getFreeUsageCount(fingerprint: string): Promise<number> {
  const kv = await getKV();
  if (!kv) return 0;
  return (await kv.get<number>(`usage:${fingerprint}`)) ?? 0;
}
