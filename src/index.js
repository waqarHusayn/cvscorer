import { PROVIDERS, MAX_BULLETS, MAX_CV_CHARS, MAX_TARGETS } from '../public/config.js';
import { BULLET_QUESTIONS, matchQuestion } from './rubric.js';

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
  return out;
}

async function scoreBullets(env, body) {
  const bullets = (Array.isArray(body.bullets) ? body.bullets : [])
    .filter((b) => typeof b === 'string' && b.trim())
    .slice(0, MAX_BULLETS)
    .map((b) => b.trim().slice(0, 600));
  const settled = await Promise.allSettled(bullets.map((b) => jev(env, b, BULLET_QUESTIONS)));
  return { results: settled.map((s) => (s.status === 'fulfilled' ? s.value : { error: String(s.reason.message || s.reason) })) };
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
  return { scores: targets.map((_, i) => answers['t' + i]) };
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const routes = { '/api/bullets': scoreBullets, '/api/match': matchSkills };
    const handler = routes[pathname];
    if (!handler) return new Response('Not found', { status: 404 });
    if (request.method !== 'POST') return json({ error: 'Use POST' }, 405);
    if (!pickProvider(env)) return json({ error: 'Set an API key in .dev.vars' }, 500);
    try {
      return json(await handler(env, await request.json()));
    } catch (err) {
      return json({ error: String(err.message || err) }, 502);
    }
  },
};
