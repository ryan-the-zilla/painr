import { SignJWT, jwtVerify } from 'jose';

const SECRET = new TextEncoder().encode(process.env.JWT_SECRET ?? 'dev-secret-change-me');

export interface ProTokenPayload {
  plan: 'monthly' | 'lifetime';
  email: string | null;
  sessionId: string;
}

export async function signProToken(payload: ProTokenPayload): Promise<string> {
  const expiresIn = payload.plan === 'lifetime' ? '365d' : '35d';
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(SECRET);
}

export async function verifyProToken(token: string): Promise<ProTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload as unknown as ProTokenPayload;
  } catch {
    return null;
  }
}
