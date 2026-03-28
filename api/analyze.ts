import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac, timingSafeEqual, createHash } from 'crypto';

// ——— Auth (inlined) ———
const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

interface ProTokenPayload { plan: string; email: string | null; sessionId: string; exp: number; }

function b64encode(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}
function b64decode(s: string): unknown {
  return JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
}
function hmacSign(header: string, body: string): string {
  return createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
}
function verifyProToken(token: string): ProTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expected = hmacSign(header, body);
    const sigBuf = Buffer.from(sig, 'base64url');
    const expBuf = Buffer.from(expected, 'base64url');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
    const payload = b64decode(body) as ProTokenPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch { return null; }
}

// ——— Rate limit (inlined) ———
const FREE_ANALYSIS_LIMIT = 3;
const THIRTY_DAYS_MS = 60 * 60 * 24 * 30 * 1000;
const memStore = new Map<string, { count: number; expires: number }>();

function getFingerprint(ip: string, ua: string): string {
  return createHash('sha256').update(ip + '|' + ua).digest('hex').slice(0, 16);
}
async function checkAndIncrementFreeUsage(fp: string): Promise<{ allowed: boolean }> {
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
      const key = `usage:${fp}`;
      const getRes = await fetch(`${url}/get/${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${token}` } });
      const getData = await getRes.json() as { result: string | null };
      const count = getData.result != null ? Number(getData.result) : 0;
      if (count >= FREE_ANALYSIS_LIMIT) return { allowed: false };
      await fetch(`${url}/set/${encodeURIComponent(key)}/${count + 1}/ex/${60 * 60 * 24 * 30}`, { headers: { Authorization: `Bearer ${token}` } });
      return { allowed: true };
    }
    const now = Date.now();
    const entry = memStore.get(fp);
    if (entry && entry.expires > now) {
      if (entry.count >= FREE_ANALYSIS_LIMIT) return { allowed: false };
      entry.count++;
    } else {
      memStore.set(fp, { count: 1, expires: now + THIRTY_DAYS_MS });
    }
    return { allowed: true };
  } catch { return { allowed: true }; }
}

// ——— AI ———
const Z_API_KEY = process.env.Z_API_KEY!;
const Z_API_BASE = 'https://api.z.ai/api/coding/paas/v4';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? 'http://localhost:3000';
const FREE_VISIBLE = 5;
const BATCH_SIZE = 20;
const MODEL_CHAIN = ['glm-5', 'glm-4.7'];

function setCors(req: VercelRequest, res: VercelResponse): boolean {
  const origin = req.headers.origin as string | undefined;
  const allowed = [ALLOWED_ORIGIN, 'http://localhost:3000', 'http://localhost:5173'];
  if (!origin || allowed.includes(origin)) {
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  } else {
    res.status(403).json({ error: 'Forbidden' }); return false;
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return true;
}

async function callAI(messages: object[], model: string): Promise<string | null> {
  const res = await fetch(`${Z_API_BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Z_API_KEY}` },
    body: JSON.stringify({ model, messages, temperature: 0.3 }),
  });
  if (!res.ok) {
    if (res.status === 429 || res.status === 503) return null;
    throw new Error(`z.ai error: ${res.status}`);
  }
  const data = await res.json();
  return (data as any)?.choices?.[0]?.message?.content ?? null;
}

async function callAIWithFallback(messages: object[]): Promise<string | null> {
  for (const model of MODEL_CHAIN) {
    const result = await callAI(messages, model);
    if (result !== null) return result;
  }
  return null;
}

function parseJSON(text: string): unknown {
  let cleaned = text.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  }
  return JSON.parse(cleaned);
}

interface Post { title: string; selftext: string; permalink: string; score: number; }
interface PainPoint { title: string; pain_summary: string; category: string; reddit_link: string; score: number; }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!setCors(req, res)) return;
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const proPayload = token ? verifyProToken(token) : null;
  const isPro = !!proPayload;

  if (!isPro) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? 'unknown';
    const ua = (req.headers['user-agent'] as string) ?? '';
    const fp = getFingerprint(ip, ua);
    const usage = await checkAndIncrementFreeUsage(fp);
    if (!usage.allowed) {
      return res.status(403).json({
        error: 'limit_reached',
        message: 'Your free analyses are used up. Upgrade to Pro for unlimited access.',
        monthly_url: process.env.MONTHLY_URL,
        lifetime_url: process.env.LIFETIME_URL,
      });
    }
  }

  const { posts, skills } = req.body || {};
  if (!Array.isArray(posts) || posts.length === 0) return res.status(400).json({ error: 'Missing posts array' });

  const userSkills: string[] = Array.isArray(skills) ? skills.filter((s: unknown) => typeof s === 'string') : [];
  const postsToAnalyze: Post[] = isPro ? posts : posts.slice(0, 100);
  const allPainPoints: PainPoint[] = [];

  try {
    for (let i = 0; i < postsToAnalyze.length; i += BATCH_SIZE) {
      const batch = postsToAnalyze.slice(i, i + BATCH_SIZE);
      const prompt = `Analyze these Reddit posts. Return only posts with a real problem, frustration, or unmet need. Ignore spam and self-promotion. Return JSON array: [{title, pain_summary, category, reddit_link, score}]\n\nPosts:\n${JSON.stringify(batch.map(p => ({ t: p.title, b: (p.selftext || '').slice(0, 300), l: p.permalink, s: p.score })))}`;
      const text = await callAIWithFallback([
        { role: 'system', content: 'You are a pain point extractor. Return only valid JSON array, no markdown, no explanation.' },
        { role: 'user', content: prompt },
      ]);
      if (text) {
        try {
          const parsed = parseJSON(text);
          if (Array.isArray(parsed)) allPainPoints.push(...(parsed as PainPoint[]));
        } catch { /* skip bad batch */ }
      }
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }

  const totalFound = allPainPoints.length;
  const returnedPoints = isPro ? allPainPoints : allPainPoints.slice(0, FREE_VISIBLE);
  const truncated = !isPro && totalFound > FREE_VISIBLE;

  let summary = null;
  if (isPro && allPainPoints.length > 0) {
    try {
      const skillsContext = userSkills.length > 0
        ? `\n\nThe user has these skills: ${userSkills.join(', ')}. Add a "skill_opportunities" array with 2-3 actionable product ideas for someone with these skills.`
        : '';
      const schema = userSkills.length > 0
        ? '{"summary":["bullet1","bullet2","bullet3"],"top_categories":["cat1","cat2","cat3"],"skill_opportunities":["idea1","idea2","idea3"]}'
        : '{"summary":["bullet1","bullet2","bullet3"],"top_categories":["cat1","cat2","cat3"]}';
      const text = await callAIWithFallback([
        { role: 'system', content: 'Return only valid JSON, no markdown.' },
        { role: 'user', content: `Analyze these pain points and return a summary. Return JSON: ${schema}\n\nPain points:\n${JSON.stringify(allPainPoints.map(p => ({ title: p.title, category: p.category, summary: p.pain_summary })))}${skillsContext}` },
      ]);
      if (text) summary = parseJSON(text);
    } catch { /* summary is optional */ }
  }

  return res.status(200).json({ painPoints: returnedPoints, totalFound, truncated, summary });
}
