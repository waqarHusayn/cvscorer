// Offline tests: rules run for real, Jev is faked.
import assert from 'node:assert/strict';
import * as r from './public/rules.js';
import worker from './src/index.js';
import { itemsToLines, linesToText } from './public/pdf.js';

const bullets = r.extractBullets(`Name
me@mail.com | +92 300 1234567 | linkedin.com/in/me
- Built a RAG pipeline with Python and FAISS that cut search time by 40%
* Worked on machine learning projects
2. Responsible for data cleaning
- Used Python 3 in 2024`);
assert.equal(bullets.length, 4);
assert.ok(r.startsWithActionVerb(bullets[0]));
assert.ok(r.startsWithActionVerb(bullets[1]));
assert.ok(!r.startsWithActionVerb(bullets[2]));
assert.ok(r.hasMetric(bullets[0]));
assert.ok(!r.hasMetric(bullets[3]), 'years and Python 3 are not results');
assert.ok(r.hasSkillWord(bullets[0]) && !r.hasSkillWord(bullets[2]));
assert.deepEqual([...new Set(r.spansFor(bullets[0]).map((s) => s.t))].sort(), ['metric', 'skill', 'verb']);
assert.deepEqual(r.checkHeader('Name\nme@mail.com | +92 300 1234567 | linkedin.com/in/me'), { email: true, phone: true, linkedin: true });

// PDF text items to CV text: wrapped bullets are joined, odd bullet glyphs are normalized
const it = (str, x, y, w = str.length * 5) => ({ str, x, y, w });
const text = linesToText(itemsToLines([[
  it('Your Name', 40, 780), it('EXPERIENCE', 40, 740),
  it('\uf0b7', 40, 720, 5), it('Built a RAG pipeline with', 58, 720),
  it('Python that cut search time', 58, 708),
  it('\u2022', 40, 690, 5), it('Worked on ML projects', 58, 690),
  it('SKILLS', 40, 660),
]]));
assert.equal(text, 'Your Name\nEXPERIENCE\n\u2022 Built a RAG pipeline with Python that cut search time\n\u2022 Worked on ML projects\nSKILLS');
assert.equal(r.extractBullets(text).length, 2);

// Fake Jev
let calls = [];
let seen = {};
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  calls.push(body);
  seen = { url, auth: init.headers.Authorization, model: body.model };
  if (body.state === 'boom') return new Response('no', { status: 500 });
  const answers = {};
  for (const name of Object.keys(body.questions)) answers[name] = { type: 'noul', noul: 0.9 };
  return new Response(JSON.stringify({ model: 'jev-1.13.0', answers, usage: {} }));
};
const post = (path, body, env = { TYPESAFE_API_KEY: 'k' }) =>
  worker.fetch(new Request('https://x' + path, { method: 'POST', body: JSON.stringify(body) }), env);

let res = await (await post('/api/bullets', { bullets: ['Built a thing', 'boom', '  '] })).json();
assert.equal(res.results.length, 2);
assert.equal(res.results[0].impact, 0.9);
assert.ok(res.results[1].error);

res = await (await post('/api/match', { cv: 'my cv', targets: ['Docker', 'SQL'] })).json();
assert.deepEqual(res.scores, [0.9, 0.9]);
assert.equal(calls.at(-1).questions.t0.instructions, 'The CV shows hands on experience with Docker.');

assert.deepEqual(seen, { url: 'https://api.typesafe.ai/v1/systemone', auth: 'Bearer k', model: 'jev-1.13' });
await post('/api/bullets', { bullets: ['x'] }, { OPENROUTER_API_KEY: 'or', TYPESAFE_API_KEY: 'k' });
assert.deepEqual(seen, { url: 'https://openrouter.ai/api/alpha/decisions', auth: 'Bearer or', model: 'typesafe/jev-1.13' });
assert.equal(calls.at(-1).questions.impact.criteria.true, 'It states an outcome or improvement');
await post('/api/bullets', { bullets: ['x'] }, { JEV_API_URL: 'https://jev.example.com/v1/systemone', JEV_API_KEY: 'c', JEV_MODEL: 'jev-x', TYPESAFE_API_KEY: 'k' });
assert.deepEqual(seen, { url: 'https://jev.example.com/v1/systemone', auth: 'Bearer c', model: 'jev-x' });
await post('/api/bullets', { bullets: ['x'] }, { EXPERIENTIAL_API_KEY: 'e', OPENROUTER_API_KEY: 'or' });
assert.deepEqual(seen, { url: 'https://api.experientiallabs.ai/v1/systemone', auth: 'Bearer e', model: 'jev-latest' });
await post('/api/bullets', { bullets: ['x'] }, { EXPERIENTIAL_API_KEY: 'e', EXPERIENTIAL_MODEL: 'jev-latest:free' });
assert.equal(seen.model, 'jev-latest:free');
assert.equal((await post('/api/bullets', { bullets: ['x'] }, {})).status, 500);
assert.equal((await worker.fetch(new Request('https://x/api/bullets'), { TYPESAFE_API_KEY: 'k' })).status, 405);
assert.equal((await post('/nope', {})).status, 404);
console.log('all tests passed');
