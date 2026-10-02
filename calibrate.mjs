import fs from 'node:fs/promises';
import { startsWithActionVerb, hasMetric } from './public/rules.js';

const YES = Number(process.env.YES || 0.6);
const UNSURE = Number(process.env.UNSURE || 0.4);
const fixturePath = new URL('./fixtures/calibration.json', import.meta.url);
const fixtures = JSON.parse(await fs.readFile(fixturePath, 'utf8'));

function localPrediction(item) {
  const verb = startsWithActionVerb(item.text);
  const metric = hasMetric(item.text);
  return verb && metric ? 1 : verb || metric ? 0.5 : 0;
}

const evaluated = fixtures.map((item) => ({ ...item, prediction: localPrediction(item) }));
const accuracy = evaluated.filter((item) => (item.prediction >= YES ? 'strong' : item.prediction >= UNSURE ? 'unsure' : 'weak') === item.label).length / evaluated.length;
console.log(`Loaded ${evaluated.length} labelled fixtures.`);
console.log(`Dry run thresholds: YES=${YES}, UNSURE=${UNSURE}, local accuracy=${(accuracy * 100).toFixed(1)}%.`);
console.log('This script is intentionally offline. To add a Jev calibration adapter, provide a mocked endpoint in tests; no live call is made by default.');
console.log('A live Jev run is not implemented behind an accidental command. Ask before adding provider credentials or incurring model charges.');
