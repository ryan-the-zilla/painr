// Reddit URL building, sanitization, and fetching logic
// Ported from reddit-json-scraper.html

const VALID_SORT = ['best', 'hot', 'new', 'top', 'rising'] as const;
const SEARCH_SORT_MAP: Record<string, string> = {
  best: 'new', hot: 'new', rising: 'new', new: 'new', top: 'top',
};

export interface RedditPost {
  title: string;
  selftext: string;
  permalink: string;
  score: number;
  subreddit: string;
  author: string;
  num_comments: number;
  created_utc: number;
  is_self: boolean;
  url: string;
  link_flair_text: string | null;
}

export interface FetchProgress {
  postCount: number;
  subreddit: string | null;
  status: 'loading' | 'done' | 'cancelled' | 'error';
  page: number;
}

function normalizeUrl(raw: string): URL {
  let s = (raw || '').trim();
  if (!s) throw new Error('Voer een subreddit link in');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  if (!/reddit\.com/i.test(s)) s = 'https://www.reddit.com/' + s.replace(/^https?:\/\//, '');
  return new URL(s);
}

function ensureJsonPath(p: string): string {
  p = (p || '').replace(/\/$/, '');
  return p.endsWith('.json') ? p : p + '.json';
}

function isPermalink(p: string): boolean {
  return /^\/r\/[^/]+\/comments\/[^/]+(\/|$)/i.test(p);
}

function isSubreddit(p: string): boolean {
  return /^\/r\/[^/]+(\/.*)?$/i.test(p);
}

export function buildJsonUrl(raw: string, opts?: { limit?: number; sort?: string; restrictSr?: boolean }): string {
  const { limit = 100, sort = 'new', restrictSr = true } = opts || {};
  const u = normalizeUrl(raw);
  const lim = Math.max(1, Math.min(100, Number(limit) || 100));
  const isSearch = /(^|\/)search(\/|$)/i.test(u.pathname);

  if (isSearch) {
    const parts = u.pathname.split('/').filter(Boolean);
    const isSub = parts[0] === 'r' && parts[2] === 'search';
    u.pathname = isSub ? '/r/' + parts[1] + '/search.json' : '/search.json';
    if (!u.searchParams.get('q')) u.searchParams.set('q', '');
    if (restrictSr && isSub) u.searchParams.set('restrict_sr', '1');
    u.searchParams.set('sort', SEARCH_SORT_MAP[sort] || 'new');
    u.searchParams.set('limit', String(lim));
    u.searchParams.set('raw_json', '1');
    return u.toString();
  }

  if (isPermalink(u.pathname)) {
    u.pathname = ensureJsonPath(u.pathname);
    u.searchParams.set('raw_json', '1');
    return u.toString();
  }

  if (isSubreddit(u.pathname)) {
    const parts = u.pathname.split('/').filter(Boolean);
    const chosen = (VALID_SORT as readonly string[]).includes(sort) ? sort : (parts[2] || 'new');
    u.pathname = '/r/' + parts[1] + '/' + chosen + '.json';
    u.searchParams.set('limit', String(lim));
    u.searchParams.set('raw_json', '1');
    return u.toString();
  }

  u.pathname = ensureJsonPath(u.pathname);
  u.searchParams.set('limit', String(lim));
  u.searchParams.set('raw_json', '1');
  return u.toString();
}

export function sanitize(urlStr: string): { cleaned: string; issues: string[] } {
  const u = new URL(urlStr);
  if (/\.json\.json$/i.test(u.pathname)) u.pathname = u.pathname.replace(/\.json\.json$/i, '.json');

  const counts = new Map<string, number>();
  const last = new Map<string, string>();
  for (const [k, v] of u.searchParams.entries()) {
    const key = k.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
    last.set(key, v);
  }

  const rebuilt = new URLSearchParams();
  for (const [k, v] of last.entries()) rebuilt.set(k, v);
  u.search = rebuilt.toString();

  if (u.searchParams.has('limit')) {
    u.searchParams.set('limit', String(Math.max(1, Math.min(100, parseInt(u.searchParams.get('limit') || '100', 10) || 100))));
  }
  u.searchParams.set('raw_json', '1');

  const issues: string[] = [];
  for (const [k, c] of counts.entries()) if (c > 1) issues.push('dup:' + k);
  if (/\.json\.json$/i.test(urlStr)) issues.push('double .json');

  return { cleaned: u.toString(), issues };
}

function toProxyUrl(url: string): string {
  try {
    const u = new URL(url);
    if (/reddit\.com$/i.test(u.hostname)) {
      return '/reddit-api' + u.pathname + u.search;
    }
  } catch { /* not a valid URL, return as-is */ }
  return url;
}

async function fetchOnce(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 1200));
    const r2 = await fetch(url);
    if (!r2.ok) throw new Error('HTTP ' + r2.status);
    const t = await r2.text();
    try { return JSON.parse(t); } catch { throw new Error('Kon data niet lezen'); }
  }
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { throw new Error('Kon data niet lezen'); }
}

export async function fetchSmart(url: string): Promise<{ json: any; viaProxy: boolean }> {
  // 1. Vite proxy (voegt User-Agent toe server-side, bypasses CORS)
  const proxyUrl = toProxyUrl(url);
  if (proxyUrl !== url) {
    try { return { json: await fetchOnce(proxyUrl), viaProxy: true }; } catch { /* fall through */ }
  }
  // 2. Direct fetch
  try { return { json: await fetchOnce(url), viaProxy: false }; } catch { /* fall through */ }
  // 3. Jina Reader als laatste fallback
  return { json: await fetchOnce('https://r.jina.ai/' + url), viaProxy: true };
}

function getDist(listing: any): number {
  const d = listing?.data || {};
  const ch = Array.isArray(d.children) ? d.children : [];
  return typeof d.dist === 'number' ? d.dist : ch.length || 0;
}

function getAfter(listing: any): string | null {
  const d = listing?.data || {};
  if (d.after) return d.after;
  const ch = Array.isArray(d.children) ? d.children : [];
  if (!ch.length) return null;
  const x = ch[ch.length - 1]?.data || {};
  if (x.name) return x.name;
  const id = x.id || (x.link_id ? String(x.link_id).replace(/^t[0-9]_/, '') : null);
  return id ? (x.kind || 't3') + '_' + id : null;
}

export function extractPosts(json: any): RedditPost[] {
  let children: any[];
  if (Array.isArray(json)) {
    children = (json[0]?.data?.children || []);
  } else {
    children = json?.data?.children || [];
  }
  return children.map((x: any) => x.data).filter(Boolean).map((p: any) => ({
    title: p.title || '',
    selftext: p.selftext || '',
    permalink: p.permalink || '',
    score: p.score || 0,
    subreddit: p.subreddit || '',
    author: p.author || '[deleted]',
    num_comments: p.num_comments || 0,
    created_utc: p.created_utc || 0,
    is_self: !!p.is_self,
    url: p.url || '',
    link_flair_text: p.link_flair_text || null,
  }));
}

export function getSubFromUrl(url: string): string | null {
  try { return (url.match(/\/r\/([^/]+)/) || [])[1] || null; } catch { return null; }
}

export function timeAgo(utc: number): string {
  const d = (Date.now() / 1000) - utc;
  if (d < 60) return Math.floor(d) + 's';
  if (d < 3600) return Math.floor(d / 60) + 'm';
  if (d < 86400) return Math.floor(d / 3600) + 'u';
  if (d < 2592000) return Math.floor(d / 86400) + 'd';
  return Math.floor(d / 2592000) + 'ma';
}

/** Fetch all posts from a Reddit URL with pagination */
export async function fetchAllPosts(
  rawUrl: string,
  sort: string,
  onProgress: (progress: FetchProgress, posts: RedditPost[]) => void,
  cancelRef: { current: boolean },
  maxPages = 5,
): Promise<RedditPost[]> {
  const built = buildJsonUrl(rawUrl, { limit: 100, sort, restrictSr: true });
  const { cleaned } = sanitize(built);
  const sub = getSubFromUrl(cleaned);
  const allPosts: RedditPost[] = [];
  let current = cleaned;

  for (let i = 0; i < maxPages; i++) {
    if (cancelRef.current) break;

    onProgress({ postCount: allPosts.length, subreddit: sub, status: 'loading', page: i + 1 }, allPosts);

    let data: any;
    try {
      data = (await fetchSmart(current)).json;
    } catch (e: any) {
      throw new Error('Kon pagina ' + (i + 1) + ' niet laden: ' + (e.message || e));
    }

    const posts = extractPosts(data);
    allPosts.push(...posts);

    onProgress({ postCount: allPosts.length, subreddit: sub, status: 'loading', page: i + 1 }, allPosts);

    if (Array.isArray(data)) break;

    const after = getAfter(data);
    if (!after) break;

    const u = new URL(current);
    u.searchParams.set('after', after);
    u.searchParams.set('count', String(allPosts.length));
    current = u.toString();

    await new Promise(r => setTimeout(r, 400));
  }

  const finalStatus = cancelRef.current ? 'cancelled' : 'done';
  onProgress({ postCount: allPosts.length, subreddit: sub, status: finalStatus, page: 0 }, allPosts);

  return allPosts;
}
