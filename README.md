# cvscorer

A Cloudflare Worker that serves a page and two API routes. The page highlights a CV live.
Plain code handles verbs, numbers, skill words and the header. Jev (TypeSafe) handles the judgement calls.

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

The Upload PDF button reads the file in the browser with pdf.js (bundled in `public/vendor`, Apache 2.0 license included).
The PDF itself never leaves the page. Only the bullet text goes to Jev, and the skills check sends the CV text.
Works best on single column CVs with real text. Scanned PDFs and two column layouts will not read well.

## Where things live

- `public/config.js`: weights, thresholds, skills list, limits.
- `src/rubric.js`: the questions Jev answers.
- `public/rules.js`: the checks that need no model.
- `public/pdf.js`: turns a PDF into plain text lines and rejoins wrapped bullets.
- `src/index.js`: the API routes that call Jev. The key never reaches the browser.
- `test.mjs`: `npm test` runs the rules and the routes with a fake Jev.

## Before you share the link

Anyone with the link can spend your TypeSafe quota. Add a Cloudflare rate limiting rule on `/api/*`,
or put the page behind Cloudflare Access.
