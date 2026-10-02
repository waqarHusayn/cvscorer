import { PROVIDERS, MAX_BULLETS, MAX_CV_CHARS, MAX_TARGETS } from '../public/config.js';
import { BULLET_QUESTIONS, matchQuestion } from './rubric.js';
import { startsWithActionVerb, weakOpener } from '../public/rules.js';

const MAX_CONCURRENCY = 6;
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;
const memoryCache = new Map();
const rateBuckets = new Map();

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function pickProvider(env) {
  if (env.JEV_API_URL && env.JEV_API_KEY) {
    return { url: env.JEV_API_URL, model: env.JEV_MODEL || 'jev-1.13', key: env.JEV_API_KEY };
  }
  for (const p of [PROVIDERS.experiential, PROVIDERS.openrouter, PROVIDERS.typesafe]) {
    if (env[p.keyVar]) return { url: p.url, model: (p.modelVar && env[p.modelVar]) || p.model, key: env[p.keyVar] };
  }
  return null;
}

async function jev(env, state, questions) {
  const provider = pickProvider(env);
  const cacheKey = `https://cvscorer-cache/${provider.model}/${hashText(`${state}\n${JSON.stringify(questions)}`)}`;
  const cache = globalThis.caches?.default;
  if (cache) {
    const cached = await cache.match(cacheKey);
    if (cached) return cached.json();
  } else if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey);
  }
  const res = await fetch(provider.url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + provider.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, model: provider.model, questions }),
    signal: AbortSignal.timeout(60_000),
    redirect: 'manual',
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 120);
    throw new Error('Jev returned ' + res.status + ' from ' + new URL(provider.url).host + (detail ? ': ' + detail : ''));
  }
  const data = await res.json();
  const out = {};
  for (const [name, answer] of Object.entries(data.answers)) out[name] = answer.noul;
  if (cache) {
    await cache.put(cacheKey, json(out, 200));
  } else {
    memoryCache.set(cacheKey, out);
  }
  return out;
}

function hashText(value) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

async function mapWithConcurrency(values, limit, mapper) {
  const results = Array(values.length);
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next++;
      try {
        results[index] = await mapper(values[index], index);
      } catch (error) {
        results[index] = { error: String(error.message || error) };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

async function scoreBullets(env, body) {
  const bullets = [...new Set((Array.isArray(body.bullets) ? body.bullets : [])
    .filter((b) => typeof b === 'string' && b.trim())
    .slice(0, MAX_BULLETS)
    .map((b) => b.trim().slice(0, 600)))];
  const results = await mapWithConcurrency(bullets, MAX_CONCURRENCY, async (bullet) => {
    // Weak openers are safely rejected locally: Jev cannot make an action verb stronger.
    if (!startsWithActionVerb(bullet) && weakOpener(bullet)) {
      return { impact: 0, clarity: 0, skipped: true, reason: 'Weak opener; replace it with a specific action.' };
    }
    return jev(env, bullet, BULLET_QUESTIONS);
  });
  return { results, progress: { scored: results.length, total: results.length } };
}

async function matchSkills(env, body) {
  const cv = typeof body.cv === 'string' ? body.cv.slice(0, MAX_CV_CHARS) : '';
  const targets = (Array.isArray(body.targets) ? body.targets : [])
    .filter((t) => typeof t === 'string' && t.trim())
    .slice(0, MAX_TARGETS)
    .map((t) => t.trim().slice(0, 80));
  if (!cv.trim() || !targets.length) return { scores: [] };
  const questions = {};
  targets.forEach((t, i) => (questions['t' + i] = matchQuestion(t)));
  const answers = await jev(env, cv, questions);
  return {
    scores: targets.map((_, i) => answers['t' + i]),
    results: targets.map((target, i) => {
      const score = answers['t' + i];
      return { target, score, status: score >= 0.7 ? 'matched' : score >= 0.4 ? 'weak' : 'missing' };
    }),
  };
}

async function rewriteBullet(env, body) {
  if (env.REWRITE_SUGGESTIONS_ENABLED !== 'true') return { error: 'Rewrite suggestions are disabled.' };
  if (!env.OPENROUTER_API_KEY) return { error: 'Set OPENROUTER_API_KEY to enable rewrite suggestions.' };
  const bullet = typeof body.bullet === 'string' ? body.bullet.trim().slice(0, 600) : '';
  if (!bullet) return { error: 'A bullet is required.' };
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + env.OPENROUTER_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env.REWRITE_MODEL || 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: `Suggest one concise resume bullet rewrite. Keep the facts and do not invent metrics:\n${bullet}` }],
      max_tokens: 120,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Rewrite model returned ${response.status}`);
  const data = await response.json();
  return { suggestion: data.choices?.[0]?.message?.content?.trim() || '' };
}

function allowed(request) {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || 'anonymous';
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) {
    rateBuckets.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= RATE_LIMIT;
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const routes = { '/api/bullets': scoreBullets, '/api/match': matchSkills, '/api/rewrite': rewriteBullet };
    const handler = routes[pathname];
    if (!handler) return new Response('Not found', { status: 404 });
    if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);
    if (!allowed(request)) return json({ error: 'Rate limit reached. Please wait a minute before trying again.' }, 429);
    if (pathname !== '/api/rewrite' && !pickProvider(env)) return json({ error: 'Set an API key in .dev.vars' }, 500);
    try {
      return json(await handler(env, await request.json()));
    } catch (err) {
      return json({ error: String(err.message || err) }, 502);
    }
  },
};
