import { ACTION_VERBS, OUTCOME_PATTERNS, SKILLS, SOFT_SKILLS } from './config.js';

const BULLET_MARKER = /^\s*(?:[-*•▪◦‣∙●○◉]|\uf0b7|\d+[.)])(?:\s+|$)/u;
const HEADING_NAMES = [
  ['experience', /\b(?:experience|work history|professional experience|employment)\b/i],
  ['projects', /\b(?:projects|selected projects|personal projects)\b/i],
  ['education', /\b(?:education|academic background)\b/i],
  ['skills', /\b(?:skills|technical skills|core competencies|technologies)\b/i],
  ['summary', /\b(?:summary|profile|objective|about me)\b/i],
  ['certifications', /\b(?:certifications|certificates|licenses)\b/i],
  ['header', /\b(?:contact|personal details)\b/i],
];

const metric = /(?:\b\d+(?:\.\d+)?\s*%|\b\d+(?:\.\d+)?\s*(?:ms|s|x|k|m|million|billion|percent)\b|\b(?:under|over|within)\s+\d+(?:\.\d+)?\s*(?:ms|s|days?|hours?)\b)/i;
const punctuationEnd = /[.!?:;,)}\]]$/u;
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const WEAK_OPENERS = {
  'worked on': 'Name the action you personally took and the result it produced.',
  'responsible for': 'Replace this with the specific action you completed and its outcome.',
  helped: 'Explain exactly what you changed, delivered, or improved.',
  involved: 'State your direct contribution with a strong action verb.',
  assisted: 'State the task you performed and the measurable result.',
};

export const normalizeBullet = (text) => String(text || '')
  .replace(/[\u200b\u200c\u200d\ufeff]/gu, '')
  .replace(/^[\s"'`–—:|>]+/u, '')
  .replace(/^(?:[-*•▪◦‣∙●○◉]|\uf0b7|\d+[.)])\s*/u, '')
  .replace(/^[^A-Za-z0-9(]+/u, '')
  .replace(/\s+/g, ' ')
  .trim();

export const isBulletLine = (line) => BULLET_MARKER.test(line);

export const rejoinWrappedLines = (text) => {
  const rawLines = String(text || '').split(/\r?\n/).map((line) => line.replace(/\s+$/, ''));
  const output = [];
  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line) continue;
    const startsBullet = isBulletLine(raw);
    const previous = output.at(-1);
    const previousText = previous ? normalizeBullet(previous) : '';
    const continuation = previous && !startsBullet && (
      /^[a-z(]/u.test(line) ||
      (!punctuationEnd.test(previousText) && !isHeading(previousText) && !isHeading(line) &&
        !startsWithActionVerb(line) && !weakOpener(line) &&
        !/^[A-Z][A-Z\s/&-]{2,}$/u.test(line))
    );
    if (continuation) output[output.length - 1] += ` ${line}`;
    else output.push(line);
  }
  return output;
};

export const extractBullets = (text) => rejoinWrappedLines(text)
  .filter(isBulletLine)
  .map(normalizeBullet)
  .filter(Boolean);

export const sectionNameFor = (line) => {
  const value = normalizeBullet(line).replace(/[:：]\s*$/, '').trim();
  if (!value || value.length > 60 || /[.!?]/u.test(value)) return null;
  for (const [name, pattern] of HEADING_NAMES) {
    if (pattern.test(value) && value.split(/\s+/).length <= 5) return name;
  }
  return null;
};

function isHeading(line) {
  return Boolean(sectionNameFor(line));
}

function makeEntry(label = '') {
  return { label, bullets: [] };
}

export const parseCV = (text) => {
  const lines = rejoinWrappedLines(text);
  const sections = [];
  let current = { name: 'header', heading: '', entries: [makeEntry()] };
  sections.push(current);
  for (const line of lines) {
    const name = sectionNameFor(line);
    if (name) {
      current = { name, heading: normalizeBullet(line), entries: [makeEntry()] };
      sections.push(current);
      continue;
    }
    if (isBulletLine(line)) {
      const bullet = normalizeBullet(line);
      if (bullet) current.entries.at(-1).bullets.push(bullet);
      continue;
    }
    const value = normalizeBullet(line);
    if (!value) continue;
    const entry = current.entries.at(-1);
    const inferredBullet = ['experience', 'projects'].includes(current.name) &&
      (startsWithActionVerb(value) || weakOpener(value) || value.split(/\s+/).length >= 8);
    if (inferredBullet) {
      entry.bullets.push(value);
      continue;
    }
    if (entry.bullets.length || entry.label) current.entries.push(makeEntry(value));
    else entry.label = value;
  }
  return {
    sections: sections
      .map((section) => ({ ...section, entries: section.entries.filter((entry) => entry.label || entry.bullets.length) }))
      .filter((section) => section.entries.length),
  };
};

export const bulletsFromCV = (cv) => parseCV(cv).sections
  .filter((section) => ['experience', 'projects'].includes(section.name))
  .flatMap((section) => section.entries.flatMap((entry) => entry.bullets));

export const startsWithActionVerb = (text) => {
  const first = normalizeBullet(text).split(/\s+/)[0]?.toLowerCase().replace(/[,:;.]$/u, '');
  return ACTION_VERBS.includes(first);
};

export const weakOpener = (text) => {
  const normalized = normalizeBullet(text).toLowerCase();
  return Object.keys(WEAK_OPENERS).find((opener) => normalized.startsWith(opener)) || null;
};

export const hasMetric = (text) => metric.test(normalizeBullet(text));
export const hasSkillWord = (text) => SKILLS.some((skill) =>
  new RegExp(`\\b${escapeRegExp(skill)}\\b`, 'i').test(normalizeBullet(text)));
export const hasSoftSkill = (text) => SOFT_SKILLS.some((skill) =>
  new RegExp(`\\b${escapeRegExp(skill)}\\b`, 'i').test(normalizeBullet(text)));
export const outcomePhrase = (text) => {
  const normalized = normalizeBullet(text);
  const match = OUTCOME_PATTERNS.map((pattern) => normalized.match(pattern)).find(Boolean);
  return match?.[0] || null;
};
export const spansFor = (text) => [
  ...(startsWithActionVerb(text) ? [{ t: 'verb' }] : []),
  ...(hasMetric(text) ? [{ t: 'metric' }] : []),
  ...(hasSkillWord(text) ? [{ t: 'skill' }] : []),
  ...(hasSoftSkill(text) ? [{ t: 'soft' }] : []),
  ...(outcomePhrase(text) ? [{ t: 'outcome' }] : []),
];

export const skillEvaluation = (cv) => {
  const parsed = parseCV(cv);
  const section = parsed.sections.find((candidate) => candidate.name === 'skills');
  const entries = section?.entries || [];
  const values = entries.flatMap((entry) => [entry.label, ...entry.bullets])
    .filter(Boolean)
    .flatMap((value) => value.split(/[,|;•]/u).map((skill) => normalizeBullet(skill.includes(':') ? skill.slice(skill.indexOf(':') + 1) : skill)).filter(Boolean));
  const normalized = values.map((value) => value.toLowerCase());
  const duplicates = [...new Set(normalized.filter((value, index) => normalized.indexOf(value) !== index))];
  const experienceText = bulletsFromCV(cv).join(' ').toLowerCase();
  const repeatedInExperience = [...new Set(values.filter((value) => experienceText.includes(value.toLowerCase())))];
  return { groups: values.length, skills: values, duplicates, repeatedInExperience };
};

export const checkHeader = (text) => ({
  email: /[\w.+-]+@[\w.-]+\.\w+/u.test(text),
  phone: /\+?\d[\d ()-]{7,}\d/u.test(text),
  linkedin: /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\//iu.test(text),
  github: /(?:https?:\/\/)?(?:www\.)?github\.com\/[\w-]+/iu.test(text),
  location: /\b(?:street|road|avenue|city|lahore|karachi|islamabad|pakistan|remote|on-site|onsite)\b/iu.test(text),
});

export const extractRequirements = (text) => {
  const requirements = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/^\s*(?:[-*•▪◦]|\d+[.)])\s*/, '').trim();
    if (!line) continue;
    const match = line.match(/^(?:must have|required|required skills|requirements?|qualifications?)\s*:?\s*(.*)$/i);
    const value = match ? match[1] : (/^\s*(?:[-*•▪◦]|\d+[.)])/.test(raw) ? line : '');
    if (value) requirements.push(value.replace(/[.;]$/, '').trim());
  }
  return [...new Set(requirements.filter((value) => value.length >= 2).map((value) => value.toLowerCase()))];
};

export const qualityChecks = (text) => {
  const bullets = bulletsFromCV(text);
  const openers = bullets.map((bullet) => normalizeBullet(bullet).split(/\s+/)[0]?.toLowerCase()).filter(Boolean);
  const repeatedOpeners = [...new Set(openers.filter((opener, index) => openers.indexOf(opener) !== index))];
  const currentSection = parseCV(text).sections.find((section) => section.name === 'experience');
  const currentLabel = currentSection?.entries?.[0]?.label || '';
  const presentTense = /\b(?:currently|present|today)\b/i.test(currentLabel);
  return {
    longBullets: bullets.filter((bullet) => bullet.split(/\s+/).length > 30),
    repeatedOpeners,
    passiveVoice: bullets.filter((bullet) => /\b(?:was|were|been|being)\s+\w+ed\b/i.test(bullet)),
    fillerPhrases: bullets.filter((bullet) => /\b(?:in order to|responsible for|worked on|various|etc\.?)\b/i.test(bullet)),
    firstPerson: bullets.filter((bullet) => /\b(?:i|me|my|we|our|us)\b/i.test(bullet)),
    tense: { currentRolePresent: presentTense, oldRolePastCandidates: bullets.filter((bullet) => !presentTense && /\b(?:ing|s)\b/i.test(bullet)) },
  };
};

export const combineChecklistScore = (bulletScore, matchScores = []) => {
  const validMatches = matchScores.filter((score) => typeof score === 'number');
  if (bulletScore === null || !validMatches.length) return bulletScore;
  const matchScore = validMatches.reduce((sum, score) => sum + score, 0) / validMatches.length;
  return (bulletScore * 0.7) + (matchScore * 0.3);
};
