import { getAuthHeaders } from './paywall';

const AI_ENDPOINT = '/api/ai';

export async function discoverSubredditsAI(niche: string): Promise<string[]> {
  const res = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify({
      model: 'glm-4.7',
      messages: [
        {
          role: 'system',
          content: 'You are a Reddit expert. Return only valid JSON, no markdown, no explanation.',
        },
        {
          role: 'user',
          content: `List 10 active Reddit subreddits where people frequently discuss problems, frustrations, and unmet needs related to: "${niche}". Return ONLY a JSON array of subreddit names without the r/ prefix. Example: ["freelance","Upwork","forhire"]`,
        },
      ],
      temperature: 0.3,
    }),
  });

  if (!res.ok) throw new Error(`AI fout: ${res.status}`);
  const data = await res.json();
  const text: string = data?.choices?.[0]?.message?.content || '[]';

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.filter((s: unknown) => typeof s === 'string' && s.length > 0);
    }
  } catch { /* ignore */ }
  return [];
}
