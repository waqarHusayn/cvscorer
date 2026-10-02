// Everything you would tune lives here and in src/rubric.js.
// The browser and the Worker both read this file.

// The Worker uses the first key it finds: Experiential, then OpenRouter, then TypeSafe direct.
// Experiential only offers jev-latest. For the others, 1.13 is pinned so thresholds do not shift.
// Set the modelVar variable if a provider needs a different spelling (for example a :free suffix).
export const PROVIDERS = {
  experiential: { url: 'https://api.experientiallabs.ai/v1/systemone', model: 'jev-latest', keyVar: 'EXPERIENTIAL_API_KEY', modelVar: 'EXPERIENTIAL_MODEL' },
  openrouter: { url: 'https://openrouter.ai/api/alpha/decisions', model: 'typesafe/jev-1.13', keyVar: 'OPENROUTER_API_KEY' },
  typesafe: { url: 'https://api.typesafe.ai/v1/systemone', model: 'jev-1.13', keyVar: 'TYPESAFE_API_KEY' },
};
export const MAX_BULLETS = 40;     // one Jev request per bullet; the free Workers plan allows 50 subrequests
export const MAX_CV_CHARS = 30000; // keeps the CV inside Jev's token limit for the skill match
export const MAX_TARGETS = 15;

export const YES = 0.6;    // a noul at or above this counts as yes
export const UNSURE = 0.4; // between UNSURE and YES a bullet is marked unsure

// How much each check counts toward the checklist score. Keep the sum at 1.
export const WEIGHTS = { verb: 0.2, metric: 0.25, impact: 0.3, skill: 0.15, header: 0.1 };

export const ACTION_VERBS = [
  'built', 'led', 'ran', 'wrote', 'made', 'taught', 'won', 'developed', 'designed',
  'implemented', 'created', 'managed', 'improved', 'collaborated', 'optimized',
  'automated', 'deployed', 'analyzed', 'trained', 'reduced', 'increased', 'delivered',
];

// Edit this list to match the jobs you are aiming for.
export const SKILLS = [
  'python', 'pytorch', 'tensorflow', 'scikit-learn', 'pandas', 'numpy', 'sql', 'docker',
  'fastapi', 'flask', 'langchain', 'rag', 'faiss', 'opencv', 'git', 'linux', 'matlab',
  'plc', 'scada', 'eeg', 'machine learning', 'deep learning', 'nlp',
];
