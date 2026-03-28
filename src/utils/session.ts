import type { RedditPost } from './reddit';

export interface PainPointData {
  title: string;
  pain_summary: string;
  category: string;
  reddit_link: string;
  score: number;
}

export interface SummaryData {
  summary: string[];
  top_categories: string[];
}

export interface Session {
  id: string;
  niche: string;
  subreddits: string[];
  posts: RedditPost[];
  painPoints: PainPointData[];
  summary: SummaryData | null;
  createdAt: number;
}

const KEY = 'rppe_sessions';
const MAX_SESSIONS = 5;

function loadAll(): Session[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveSession(session: Session): void {
  const all = loadAll().filter(s => s.id !== session.id);
  all.unshift(session);
  localStorage.setItem(KEY, JSON.stringify(all.slice(0, MAX_SESSIONS)));
}

export function listSessions(): Session[] {
  return loadAll();
}

export function deleteSession(id: string): void {
  const all = loadAll().filter(s => s.id !== id);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
