# cvscorer

A Cloudflare Worker that serves a page and two API routes. The page highlights a CV live.
Plain code handles section parsing, bullet extraction, verbs, numbers, skill words and the header. Jev handles the judgement calls.

## Run it locally

1. `npm install`
2. Copy `.dev.vars.example` to `.dev.vars` and put your Experiential key in it (or an OpenRouter or TypeSafe key).
3. `npm run dev` and open the address it prints.

## Put it online

1. `npx wrangler login`
2. `npx wrangler secret put EXPERIENTIAL_API_KEY` and paste your key. Use the OpenRouter or TypeSafe variable instead if that is where your key is from.
3. `npm run deploy`. You get a `something.workers.dev` link.

## Which Jev key to use

The Worker checks in this order and uses the first one it finds:

1. `JEV_API_URL` + `JEV_API_KEY` (+ optional `JEV_MODEL`): any host that accepts the System One request format.
2. `EXPERIENTIAL_API_KEY` (+ optional `EXPERIENTIAL_MODEL`): api.experientiallabs.ai, model `jev-latest`.
3. `OPENROUTER_API_KEY`
4. `TYPESAFE_API_KEY`

A key only works on the host that issued it. A 401 usually means the key is going to the wrong host.

## PDF upload

The Upload PDF button reads selectable text from every page in the browser with the bundled
pdf.js parser in `public/vendor`. Page boundaries are preserved before section and bullet
parsing. It keeps extracted text in the textarea and reports scanned/image-only, encrypted, or
damaged PDFs clearly. The PDF itself never leaves the page.
Only the bullet text goes to Jev, and the skills check sends the CV text.
Works best on single column CVs with real text. Scanned PDFs and two column layouts will not read well.

## Where things live

- `public/config.js`: weights, thresholds, skills list, limits.
- `src/rubric.js`: the questions Jev answers.
- `public/rules.js`: section parser, bullet normalization, local checks, skills evaluation and header checks.
- `public/pdf.js`: turns a PDF into plain text lines and rejoins wrapped bullets.
- `src/index.js`: the API routes that call Jev. The key never reaches the browser.
- `test.mjs`: `npm test` runs the rules and the routes with a fake Jev.
- `fixtures/calibration.json`: labelled local-check fixtures, including wrapped and glyph-prefixed bullets.
- `calibrate.mjs`: offline calibration report. It never makes a paid Jev call by default.

## Stage 1 scoring structure

`parseCV(text)` returns `{ sections: [{ name, heading, entries: [{ label, bullets }] }] }`.
Only bullets in `experience` and `projects` are sent for bullet scoring; headings, education,
skills lists and contact lines are not treated as experience bullets. `skillEvaluation(text)`
reports the skill list, duplicates and skills repeated in experience/project bullets.
Bullet text is normalized before checks, including PDF bullet glyphs and stray leading characters.
For PDFs that omit bullet glyphs, long lines and lines beginning with a known action verb or
weak opener are inferred as achievement bullets only inside Experience and Projects.
The default local thresholds remain `YES=0.6` and `UNSURE=0.4`; the checklist is not an ATS score.
Run `npm run calibrate` for the offline fixture report. Never run a live calibration without
confirming first because Jev requests may incur charges.

## Stage 2 request efficiency

The browser caches successful bullet results in `localStorage` by normalized bullet hash and
only sends uncached bullets. The Worker deduplicates bullets, caches successful Jev results in
the Cloudflare Cache API (with an in-memory fallback for local tests), and limits Jev work to
six concurrent requests. Weak opener bullets are rejected locally because Jev cannot repair
their wording. A new score request cancels the previous request with `AbortController`.
The Worker allows 60 `/api/*` requests per client IP per minute and returns HTTP 429 with a
clear message when that limit is reached.

## Stage 3 dashboard

The browser dashboard is built with plain HTML, CSS and JavaScript modules. It includes an
overall checklist gauge, category and section bars, a per-bullet strip, section-grouped
annotations, a ranked fix list, visible annotation labels, keyboard focus states, a dark-mode
toggle, mobile layout down to 360px and a print stylesheet. Charts use inline SVG or HTML/CSS;
there are no framework or CDN dependencies. The score deliberately remains a checklist score,
not an ATS score or hiring prediction.

## Stage 4 features

The optional job-description box extracts requirement lines, including bullets and
`must have`/`required` labels, then sends one Jev noul question per requirement against the
CV. Results are classified as `matched`, `weak`, or `missing` using 0.7 and 0.4 cutoffs.
Code-only quality checks flag bullets over 30 words, repeated openers, passive voice, filler
phrases, first-person pronouns and tense review candidates. Reports can be downloaded as JSON
or printed using the browser print stylesheet.

The annotation key is implemented with explainable local rules: red action verbs, pink hard
skills, green metrics, cyan outcome phrases, and yellow soft skills. Outcome phrases are
separated from their numeric evidence where possible, so “reduced search time” and “by 40%”
receive different labels rather than one blended score.

The dashboard does not generate replacement resume text. This avoids
labeling every bullet that lacks one optional checklist element as needing improvement. Users
see the evidence-based annotations, category scores, rule losses, penalties and quality checks
instead. The optional semantic review uses Jev for judgement calls only; it is not used to
write resume text.

The recruiter-style score uses the centralized 100-point model in `public/config.js`:
role/keyword match (30), experience and impact (25), parseability (15), section structure
(10), skills evidence (8), education (5), and language quality (7). Missing required skills
apply configurable knockout caps. Without a job description the result is labeled a generic
role match with lower confidence. Every deterministic rule includes an id, category, status,
points, possible points and a reason.

The offline `eval/` dataset is deliberately placeholder-only. Run `npm run eval` for Spearman
correlation, mean absolute error, shortlist agreement and inter-rater agreement. Run
`npm run eval:edits` for controlled-edit direction checks and `npm run eval:ablation` to see
the effect of removing each category's points. These scripts never call Jev and do not log CV
content.

## Before you share the link

Anyone with the link can spend your TypeSafe quota. Add a Cloudflare rate limiting rule on `/api/*`,
or put the page behind Cloudflare Access.
