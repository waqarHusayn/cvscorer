import fs from 'node:fs/promises';
import { scoreRecruiter } from '../public/rules.js';
import { mean, meanAbsoluteError, spearman, shortlistAgreement } from './metrics.mjs';

const dataset = JSON.parse(await fs.readFile(new URL('./dataset.json', import.meta.url)));
const results = dataset.map((entry) => ({ ...entry, predicted: scoreRecruiter(entry.cv, entry.job_description).score }));
const human = results.map((entry) => mean([entry.rater1, entry.rater2]));
const predictedShortlist = results.map((entry) => entry.predicted >= 70);
const humanShortlist = results.map((entry) => entry.shortlist);
console.log(JSON.stringify({
  entries: results.length,
  placeholders: results.filter((entry) => entry.placeholder).length,
  spearman: Number(spearman(results.map((entry) => entry.predicted), human).toFixed(3)),
  mean_absolute_error: Number(meanAbsoluteError(results.map((entry) => entry.predicted), human).toFixed(2)),
  shortlist_agreement: Number(shortlistAgreement(predictedShortlist, humanShortlist).toFixed(3)),
  inter_rater_agreement: Number(spearman(results.map((entry) => entry.rater1), results.map((entry) => entry.rater2)).toFixed(3)),
}, null, 2));
