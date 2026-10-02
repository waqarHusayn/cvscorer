export const PROVIDERS = {
  experiential: { url: 'https://api.experientiallabs.ai/v1/systemone', model: 'jev-latest', keyVar: 'EXPERIENTIAL_API_KEY', modelVar: 'EXPERIENTIAL_MODEL' },
  openrouter: { url: 'https://openrouter.ai/api/alpha/decisions', model: 'typesafe/jev-1.13', keyVar: 'OPENROUTER_API_KEY' },
  typesafe: { url: 'https://api.typesafe.ai/v1/systemone', model: 'jev-1.13', keyVar: 'TYPESAFE_API_KEY' },
};
export const MAX_BULLETS = 40;
export const MAX_CV_CHARS = 30000;
export const MAX_TARGETS = 15;
export const YES = 0.6;
export const UNSURE = 0.4;
export const WEIGHTS = { verb: 0.2, metric: 0.25, impact: 0.3, skill: 0.15, header: 0.1 };
export const ACTION_VERBS = ['built', 'led', 'ran', 'wrote', 'made', 'taught', 'won', 'worked', 'developed', 'designed', 'implemented', 'created', 'managed', 'improved', 'collaborated', 'optimized', 'automated', 'deployed', 'analyzed', 'trained', 'reduced', 'increased', 'delivered'];
export const SKILLS = ['python', 'pytorch', 'tensorflow', 'scikit-learn', 'pandas', 'numpy', 'sql', 'docker', 'fastapi', 'flask', 'langchain', 'rag', 'faiss', 'opencv', 'git', 'linux', 'matlab', 'plc', 'scada', 'eeg', 'machine learning', 'deep learning', 'nlp'];
