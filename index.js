import { PROVIDERS, MAX_BULLETS, MAX_CV_CHARS, MAX_TARGETS } from '../public/config.js';
import { BULLET_QUESTIONS, matchQuestion } from './rubric.js';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

// Custom endpoint first (JEV_API_URL + JEV_API_KEY, for any host that speaks the System One format),
// then Experiential, OpenRouter, TypeSafe direct. Returns null when no key is set.
function pickProvider(env) {
  if (env.JEV_API_URL && env.JEV_API_KEY) {
    return { url: env.JEV_API_URL, model: env.JEV_MODEL || 'jev-1.13', key: env.JEV_API_KEY };
  }
  for (const p of [PROVIDERS.experiential, PROVIDERS.openrouter, PROVIDERS.typesafe]) {
    if (env[p.keyVar]) return { url: p.url, model: (p.modelVar && env[p.modelVar]) || p.model, key: env[p.keyVar] };
  }
  return null;
}

// One Jev request. Returns { questionName: noulProbability }.
async function jev(env, state, questions) {
  const provider = pickProvider(env);
  const res = await fetch(provider.url, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + provider.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ state, model: provider.model, questions }),
    // A timeout does not mean the call was not charged, so there are no automatic retries.
    signal: AbortSignal.timeout(60_000),
    redirect: 'error',
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 120);
    throw new Error('Jev returned ' + res.status + ' from ' + new URL(provider.url).host + (detail ? ': ' + detail : ''));
  }
  const data = await res.json();
  const out = {};
  for (const [name, answer] of Object.entries(data.answers)) out[name] = answer.noul;
  return out;
}

// Each bullet is its own request, so the model only sees the text it is judging.
async function scoreBullets(env, body) {
  const bullets = (Array.isArray(body.bullets) ? body.bullets : [])
    .filter((b) => typeof b === 'string' && b.trim())
    .slice(0, MAX_BULLETS)
    .map((b) => b.trim().slice(0, 600));
  const settled = await Promise.allSettled(bullets.map((b) => jev(env, b, BULLET_QUESTIONS)));
  const results = settled.map((s) => (s.status === 'fulfilled' ? s.value : { error: String(s.reason.message || s.reason) }));
  return { results };
}

// One request: the whole CV as state, one question per target skill.
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
  return { scores: targets.map((_, i) => answers['t' + i]) };
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const routes = { '/api/bullets': scoreBullets, '/api/match': matchSkills };
    const handler = routes[pathname];
    if (!handler) return new Response('Not found', { status: 404 });
    if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);
    if (!pickProvider(env)) return json({ error: 'Set EXPERIENTIAL_API_KEY (or OPENROUTER_API_KEY, TYPESAFE_API_KEY, or JEV_API_URL with JEV_API_KEY) on the server' }, 500);
    try {
      return json(await handler(env, await request.json()));
    } catch (err) {
      return json({ error: String(err.message || err) }, 502);
    }
  },
};
