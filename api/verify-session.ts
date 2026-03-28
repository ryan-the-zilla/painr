import type { VercelRequest, VercelResponse } from '@vercel/node';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2026-03-25.dahlia' });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
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

    return res.status(200).json({
      valid: true,
      plan,
      email: session.customer_details?.email ?? null,
      expires: isLifetime ? null : (session as any).expires_at ?? null,
    });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
}
