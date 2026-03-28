import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';
import { signProToken } from './_lib/auth';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' });
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { session_id } = req.query;
  if (!session_id || typeof session_id !== 'string') {
    return res.status(400).json({ error: 'Missing session_id' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status !== 'paid') {
      return res.status(402).json({ error: 'Not paid' });
    }

    const isLifetime = session.mode === 'payment';
    const plan = isLifetime ? 'lifetime' : 'monthly';
    const email = session.customer_details?.email ?? null;

    const token = await signProToken({ plan, email, sessionId: session_id });

    return res.status(200).json({
      valid: true,
      plan,
      email,
      token,
      expires: isLifetime ? null : (session as any).expires_at ?? null,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}
