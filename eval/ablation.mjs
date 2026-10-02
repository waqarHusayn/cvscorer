import fs from 'node:fs/promises';
import { scoreRecruiter } from '../public/rules.js';
import { mean, spearman } from './metrics.mjs';

const dataset = JSON.parse(await fs.readFile(new URL('./dataset.json', import.meta.url)));
const human = dataset.map((entry) => mean([entry.rater1, entry.rater2]));
const rows = dataset.map((entry) => scoreRecruiter(entry.cv, entry.job_description));
const full = spearman(rows.map((result) => result.score), human);
const categories = [...new Set(rows.flatMap((result) => result.categories.map((item) => item.name)))];
console.log(JSON.stringify({
  full_correlation: Number(full.toFixed(3)),
  ablations: categories.map((name) => {
    const scores = rows.map((result) => result.score - (result.categories.find((item) => item.name === name)?.points || 0));
    return { removed: name, correlation: Number(spearman(scores, human).toFixed(3)), mean_score_delta: Number((mean(scores) - mean(rows.map((result) => result.score))).toFixed(2)) };
  }),
}, null, 2));
