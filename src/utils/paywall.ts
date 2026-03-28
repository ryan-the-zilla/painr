export const MONTHLY_URL = 'https://buy.stripe.com/28EaEZ1Op3Q6d8CaK73oA09';
export const LIFETIME_URL = 'https://buy.stripe.com/dRm6oJboZ86m2tYbOb3oA0a';

const FREE_LIMIT = 3;
export const FREE_VISIBLE_PAIN_POINTS = 5;
const STORAGE_KEY = 'rppe_usage';
const PRO_KEY = 'rppe_pro';
const DEV_KEY = 'rppe_dev';

declare global {
  interface Window {
    __PAINR_DEV_CODE__?: string;
  }
}

interface ProData {
  plan: 'monthly' | 'lifetime' | 'dev';
  email: string | null;
  session_id: string;
  activatedAt: number;
}

export function getUsageCount(): number {
  try {
    return parseInt(localStorage.getItem(STORAGE_KEY) ?? '0', 10);
  } catch {
    return 0;
  }
}

export function incrementUsage(): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(getUsageCount() + 1));
  } catch {}
}

export function getRemainingFree(): number {
  return Math.max(0, FREE_LIMIT - getUsageCount());
}

export function isPro(): boolean {
  try {
    if (localStorage.getItem(DEV_KEY) === 'active') return true;
    const raw = localStorage.getItem(PRO_KEY);
    if (!raw) return false;
    const data: ProData = JSON.parse(raw);
    return !!data.plan;
  } catch {
    return false;
  }
}

export function activateDev(code: string): boolean {
  const runtimeDevCode =
    typeof window !== 'undefined' && window.location.hostname === 'localhost'
      ? window.__PAINR_DEV_CODE__
      : undefined;

  if (runtimeDevCode && code === runtimeDevCode) {
    localStorage.setItem(DEV_KEY, 'active');
    localStorage.setItem(PRO_KEY, JSON.stringify({
      plan: 'dev', email: 'dev', session_id: 'dev', activatedAt: Date.now(),
    }));
    return true;
  }
  return false;
}

export function getProData(): ProData | null {
  try {
    const raw = localStorage.getItem(PRO_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function activateSession(sessionId: string): Promise<{ success: boolean; plan?: string; error?: string }> {
  try {
    const res = await fetch(`/api/verify-session?session_id=${encodeURIComponent(sessionId)}`);
    const data = await res.json();
    if (!res.ok || !data.valid) return { success: false, error: data.error ?? 'Betaling niet gevonden' };

    const proData: ProData = {
      plan: data.plan,
      email: data.email,
      session_id: sessionId,
      activatedAt: Date.now(),
    };
    localStorage.setItem(PRO_KEY, JSON.stringify(proData));
    return { success: true, plan: data.plan };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export function canRunAnalysis(): boolean {
  return isPro() || getUsageCount() < FREE_LIMIT;
}
