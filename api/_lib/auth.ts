import { createHmac, timingSafeEqual } from 'node:crypto';

const SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';

export interface ProTokenPayload {
  plan: 'monthly' | 'lifetime';
  email: string | null;
  sessionId: string;
  exp: number;
}

function b64encode(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function b64decode(s: string): unknown {
  return JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
}

function sign(header: string, body: string): string {
  return createHmac('sha256', SECRET).update(`${header}.${body}`).digest('base64url');
}

export function signProToken(payload: Omit<ProTokenPayload, 'exp'>): string {
  const exp = Math.floor(Date.now() / 1000) + (payload.plan === 'lifetime' ? 365 * 24 * 3600 : 35 * 24 * 3600);
  const header = b64encode({ alg: 'HS256', typ: 'JWT' });
  const body = b64encode({ ...payload, exp });
  return `${header}.${body}.${sign(header, body)}`;
}

export function verifyProToken(token: string): ProTokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expected = sign(header, body);
    const sigBuf = Buffer.from(sig, 'base64url');
    const expBuf = Buffer.from(expected, 'base64url');
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
    const payload = b64decode(body) as ProTokenPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
