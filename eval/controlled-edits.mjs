import assert from 'node:assert/strict';
import { scoreRecruiter } from '../public/rules.js';

const base = `Candidate [name]\n[email] | [phone]\nEXPERIENCE\nEngineer | [dates]\n- Built a Python service.\nSKILLS\nPython\nEDUCATION\n[degree]`;
const job = 'Required:\n- Python';
const baseScore = scoreRecruiter(base, job).score;
assert.ok(scoreRecruiter(base.replace('Built a Python service.', 'Built a Python service that reduced latency by 40%.'), job).score > baseScore);
assert.ok(scoreRecruiter(base.replace('SKILLS\nPython', ''), job).score <= baseScore);
assert.ok(scoreRecruiter(base.replace('- Built a Python service.', '- Built Python Python Python Python Python Python Python Python Python Python Python Python Python Python Python Python.'), job).score <= baseScore);
assert.ok(scoreRecruiter(base.replace('SKILLS\nPython', 'SKILLS\nPython\tSQL'), job).score < baseScore);
assert.ok(scoreRecruiter(base.replace('Built a Python service.', 'I built a Python service.'), job).score <= baseScore);
console.log('controlled edits passed');
