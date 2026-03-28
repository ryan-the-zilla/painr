import type { VercelRequest, VercelResponse } from '@vercel/node';

const Z_API_KEY = process.env.Z_API_KEY!;
const Z_API_BASE = 'https://api.z.ai/api/coding/paas/v4';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? 'http://localhost:3000';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin as string | undefined;
  const allowed = [ALLOWED_ORIGIN, 'http://localhost:3000'];
  if (origin && allowed.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (origin) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { model, messages, temperature } = req.body || {};
  if (!model || !messages) return res.status(400).json({ error: 'Missing model or messages' });

  try {
    const upstream = await fetch(`${Z_API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Z_API_KEY}`,
      },
      body: JSON.stringify({ model, messages, temperature: temperature ?? 0.3 }),
    });

    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
