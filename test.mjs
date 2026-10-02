// Offline tests: rules run for real, Jev is faked.
import assert from 'node:assert/strict';
import * as r from './public/rules.js';
import worker from './src/index.js';
import { itemsToLines, linesToText, pagesToText } from './public/pdf.js';
import fs from 'node:fs/promises';

const bullets = r.extractBullets(`Name
me@mail.com | +92 300 1234567 | linkedin.com/in/me
- Built a RAG pipeline with Python and FAISS that cut search time by 40%
* Worked on machine learning projects
2. Responsible for data cleaning
- Used Python 3 in 2024`);
assert.equal(bullets.length, 4);
assert.ok(r.startsWithActionVerb(bullets[0]));
assert.ok(!r.startsWithActionVerb(bullets[1]), 'weak openers are not strong action verbs');
assert.ok(!r.startsWithActionVerb(bullets[2]));
assert.ok(r.hasMetric(bullets[0]));
assert.ok(!r.hasMetric(bullets[3]), 'years and Python 3 are not results');
assert.ok(r.hasSkillWord(bullets[0]) && !r.hasSkillWord(bullets[2]));
assert.deepEqual([...new Set(r.spansFor(bullets[0]).map((s) => s.t))].sort(), ['metric', 'outcome', 'skill', 'verb']);
assert.ok(r.spansFor('Built a Python service that reduced latency by 40%').every((span) => Number.isInteger(span.start) && Number.isInteger(span.end) && span.end > span.start));
assert.deepEqual(r.checkHeader('Name\nme@mail.com | +92 300 1234567 | linkedin.com/in/me'), {
  email: true, phone: true, linkedin: true, github: false, location: false,
});

// Stage 1 structure: only experience and project bullets are scorable.
const structured = r.parseCV(`Jane Doe
jane@example.com | +1 555 1234567 | github.com/jane | Lahore
SUMMARY
Engineer building useful systems.
EXPERIENCE
Senior Engineer
- Built an ingestion service
that processed 1m records.
EDUCATION
- Bachelor of Science
SKILLS
Languages: Python, SQL, Python
PROJECTS
Inventory platform
• Diagnosed and fixed context window degradation issues through chunk reranking.`);
assert.deepEqual(structured.sections.map((section) => section.name), ['header', 'summary', 'experience', 'education', 'skills', 'projects']);
assert.deepEqual(r.bulletsFromCV(structured.sections ? `Jane Doe\nEXPERIENCE\nSenior Engineer\n- Built an ingestion service\nthat processed 1m records.\nEDUCATION\n- Bachelor of Science\nPROJECTS\n- Diagnosed and fixed context window degradation issues through chunk reranking.` : ''), [
  'Built an ingestion service that processed 1m records.',
  'Diagnosed and fixed context window degradation issues through chunk reranking.',
]);
assert.deepEqual(r.bulletsFromCV(`EXPERIENCE
Senior Engineer
Built an ingestion service that processed 1m records.
Improved deployment reliability for three teams.
EDUCATION
Bachelor of Science
SKILLS
Python, SQL`), [
  'Built an ingestion service that processed 1m records.',
  'Improved deployment reliability for three teams.',
]);
assert.ok(r.startsWithActionVerb('• Diagnosed and fixed context window degradation issues through chunk reranking.'));
assert.ok(r.startsWithActionVerb('\uf0b7 Architected a full inventory and operations management system in Java...'));
assert.ok(r.startsWithActionVerb('— Engineered a sub-100ms gesture recognition pipeline.'));
assert.ok(r.hasMetric('Engineered a sub-100ms gesture recognition pipeline.'));
assert.ok(r.hasSoftSkill('Collaborated with product and engineering teams.'));
assert.equal(r.outcomePhrase('Reduced search time by 40% through chunk reranking.'), 'Reduced search time');
assert.ok(r.spansFor('Collaborated with teams and reduced latency by 40%').some((span) => span.t === 'soft'));
assert.ok(r.spansFor('Collaborated with teams and reduced latency by 40%').some((span) => span.t === 'outcome'));
assert.equal(r.combineChecklistScore(0.8, []), 0.8);
assert.ok(Math.abs(r.combineChecklistScore(0.8, [0.2]) - 0.62) < 1e-9);
assert.equal(r.normalizeSkill('Scikit Learn'), 'scikit-learn');
assert.equal(r.normalizeSkill('JS'), 'javascript');
assert.equal(r.normalizeSkill('realtime'), 'real-time');
const recruiterScore = r.scoreRecruiter(`Jane Doe
jane@example.com | +1 555 1234567
EXPERIENCE
Senior Engineer
- Built a Python service that reduced latency by 40% for 12 users.
- Led Docker deployments for three teams.
SKILLS
Python, Docker, Scikit Learn
EDUCATION
Bachelor of Science`, `Required:
- Python
- JavaScript
Preferred:
- Docker`);
assert.equal(recruiterScore.rules_version, '2026-10-recruiter-v1');
assert.equal(recruiterScore.label, 'role match');
assert.deepEqual(recruiterScore.missingMustHave, ['javascript']);
assert.ok(recruiterScore.score <= 80);
assert.ok(recruiterScore.categories.every((item) => item.rules.every((rule) => 'id' in rule && 'category' in rule && 'status' in rule && 'points' in rule && 'possible' in rule && 'reason' in rule)));
const evalDataset = JSON.parse(await fs.readFile('./eval/dataset.json', 'utf8'));
assert.equal(evalDataset.length, 10);
assert.ok(evalDataset.every((entry) => entry.placeholder === true && typeof entry.rater1 === 'number' && typeof entry.rater2 === 'number'));
assert.equal(r.weakOpener('Worked on machine learning projects'), 'worked on');
assert.equal(r.weakOpener('Responsible for data cleaning'), 'responsible for');
const appSource = await fs.readFile('./public/app.js', 'utf8');
assert.match(appSource, /escapeHtml/);
assert.ok(!appSource.includes('${section.name}</h3>'));
assert.deepEqual(r.skillEvaluation(`SKILLS\nLanguages: Python, SQL, Python\nEXPERIENCE\nEngineer\n- Built Python and SQL services`).duplicates, ['python']);
assert.deepEqual(r.skillEvaluation(`SKILLS\nLanguages: Python, SQL\nEXPERIENCE\nEngineer\n- Built Python and SQL services`).repeatedInExperience, ['Python', 'SQL']);
assert.deepEqual(r.checkHeader('github.com/jane | Lahore'), { email: false, phone: false, linkedin: false, github: true, location: true });
assert.deepEqual(r.extractRequirements(`Requirements:
- Python
- SQL
Must have: Docker
Nice to have: public speaking`), ['python', 'sql', 'docker']);
assert.deepEqual(r.extractRequirements('You should have experience with Python and SQL; required: Docker'), ['python', 'sql', 'docker']);
const quality = r.qualityChecks(`EXPERIENCE
Current role
- Built a very long bullet that contains many words and keeps going until it passes the thirty word limit with filler phrases in order to describe the work in excessive detail for this test case.
- Built another service
- Built one more service
- I improved our process`);
assert.equal(quality.longBullets.length, 1);
assert.ok(quality.repeatedOpeners.includes('built'));
assert.equal(quality.firstPerson.length, 1);
const fairA = r.scoreRecruiter('Alex Smith\nEXPERIENCE\nEngineer\n- Built Python services.\nSKILLS\nPython\nEDUCATION\nPrestigious University');
const fairB = r.scoreRecruiter('Candidate\nEXPERIENCE\nEngineer\n- Built Python services.\nSKILLS\nPython\nEDUCATION\nCommunity College');
assert.equal(fairA.score, fairB.score, 'university prestige must not affect score');
assert.ok(r.scoreRecruiter('EXPERIENCE\nEngineer\n- Built Python services.\n- Built Python services.').penalties.some((item) => item.id === 'penalty.near-duplicate'));

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
const pageOne = itemsToLines([[it('EXPERIENCE', 40, 740), it('• Built page one service', 40, 720)]]);
const pageTwo = itemsToLines([[it('PROJECTS', 40, 740), it('• Delivered page two project', 40, 720)]]);
assert.equal(pagesToText([
  [it('EXPERIENCE', 40, 740), it('• Built page one service', 40, 720)],
  [it('PROJECTS', 40, 740), it('• Delivered page two project', 40, 720)],
]), 'EXPERIENCE\n• Built page one service\nPROJECTS\n• Delivered page two project');

// Fake Jev
let calls = [];
let seen = {};
globalThis.fetch = async (url, init) => {
  const body = JSON.parse(init.body);
  calls.push(body);
  seen = { url, auth: init.headers.Authorization, model: body.model };
  if (String(url).includes('/chat/completions')) {
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Built a clearer result-focused bullet.' } }] }));
  }
  if (body.state === 'boom') return new Response('no', { status: 500 });
  const answers = {};
  for (const name of Object.keys(body.questions)) answers[name] = { type: 'noul', noul: 0.9 };
  return new Response(JSON.stringify({ model: 'jev-1.13.0', answers, usage: {} }));
};
const post = (path, body, env = { TYPESAFE_API_KEY: 'k' }, headers = {}) =>
  worker.fetch(new Request('https://x' + path, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  }), env);

let res = await (await post('/api/bullets', { bullets: ['Built a thing', 'boom', '  '] })).json();
assert.equal(res.results.length, 2);
assert.equal(res.results[0].impact, 0.9);
assert.ok(res.results[1].error);
res = await (await post('/api/bullets', {
  bullets: ['Worked on machine learning projects', 'Built a cached thing', 'Built a cached thing'],
}, { TYPESAFE_API_KEY: 'k' }, { 'CF-Connecting-IP': 'stage2-dedupe' })).json();
assert.equal(res.results.length, 2);
assert.equal(res.results[0].skipped, true);
assert.equal(res.progress.scored, 2);
const callsAfterDedupe = calls.length;
await post('/api/bullets', { bullets: ['Built a cached thing'] }, { TYPESAFE_API_KEY: 'k' }, { 'CF-Connecting-IP': 'stage2-cache' });
assert.equal(calls.length, callsAfterDedupe, 'server cache avoids a repeated Jev call');

res = await (await post('/api/match', { cv: 'my cv', targets: ['Docker', 'SQL'] })).json();
assert.deepEqual(res.scores, [0.9, 0.9]);
assert.deepEqual(res.results.map((item) => item.status), ['matched', 'matched']);
assert.equal(calls.at(-1).questions.t0.instructions, 'The CV shows hands on experience with Docker.');
res = await (await post('/api/semantic', {
  bullets: ['Built a service with Python', 'Led a migration'],
  target: 'platform engineer',
}, { TYPESAFE_API_KEY: 'k' }, { 'CF-Connecting-IP': 'semantic-batch' })).json();
assert.equal(res.results.length, 2);
assert.deepEqual(res.results[0], {
  bullet: 'Built a service with Python',
  result: 0.9,
  relevance: 0.9,
  skillEvidence: 0.9,
  credibility: 0.9,
});
assert.equal(calls.at(-1).questions.b0_result.instructions, 'The text states a concrete result or measurable change caused by the work.');
assert.equal(Object.keys(calls.at(-1).questions).length, 8);

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
assert.deepEqual(await (await post('/api/rewrite', { bullet: 'Built a thing' }, { OPENROUTER_API_KEY: 'or' })).json(), { error: 'Rewrite suggestions are disabled.' });
assert.deepEqual(await (await post('/api/rewrite', { bullet: 'Built a thing' }, { OPENROUTER_API_KEY: 'or', REWRITE_SUGGESTIONS_ENABLED: 'true' })).json(), { suggestion: 'Built a clearer result-focused bullet.' });
assert.equal((await worker.fetch(new Request('https://x/api/bullets'), { TYPESAFE_API_KEY: 'k' })).status, 405);
assert.equal((await post('/nope', {})).status, 404);
const limitedHeaders = { 'CF-Connecting-IP': 'stage2-rate-limit' };
for (let i = 0; i < 60; i++) await post('/api/bullets', { bullets: [] }, { TYPESAFE_API_KEY: 'k' }, limitedHeaders);
assert.equal((await post('/api/bullets', { bullets: [] }, { TYPESAFE_API_KEY: 'k' }, limitedHeaders)).status, 429);

let validationCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  validationCalls += 1;
  if (validationCalls === 1) return new Response(JSON.stringify({ answers: {} }));
  const body = JSON.parse(init.body);
  const answers = {};
  for (const name of Object.keys(body.questions)) answers[name] = { noul: 0.75 };
  return new Response(JSON.stringify({ answers }));
};
res = await (await post('/api/bullets', { bullets: ['Built a validation retry example'] }, { TYPESAFE_API_KEY: 'k' }, { 'CF-Connecting-IP': 'validation-retry' })).json();
assert.equal(validationCalls, 2);
assert.equal(res.results[0].impact, 0.75);
validationCalls = 0;
globalThis.fetch = async () => {
  validationCalls += 1;
  throw new DOMException('timed out', 'TimeoutError');
};
res = await (await post('/api/bullets', { bullets: ['Built a timeout example'] }, { TYPESAFE_API_KEY: 'k' }, { 'CF-Connecting-IP': 'timeout-no-retry' })).json();
assert.ok(res.results[0].error);
assert.equal(validationCalls, 1);
globalThis.fetch = originalFetch;
const deterministicInput = 'EXPERIENCE\n- Built a Python service that reduced latency by 40%.';
assert.deepEqual(r.scoreRecruiter(deterministicInput), r.scoreRecruiter(deterministicInput));
console.log('all tests passed');
