import { ACTION_VERBS, OUTCOME_PATTERNS, RULES_VERSION, SCORE_MODEL, SKILL_ALIASES, SKILLS, SOFT_SKILLS } from './config.js';

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
const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
const normalizeText = (value) => String(value || '').toLowerCase().replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();

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
export const normalizeSkill = (skill) => {
  const value = normalizeText(skill).replace(/[.,;:()[\]{}]/g, '').trim();
  return SKILL_ALIASES[value] || value;
};
export const skillOccurrences = (text) => {
  const source = normalizeText(text);
  const found = [];
  const candidates = [...new Set([...SKILLS, ...Object.keys(SKILL_ALIASES)])].sort((a, b) => b.length - a.length);
  for (const candidate of candidates) {
    const pattern = new RegExp(`\\b${escapeRegExp(candidate)}\\b`, 'gi');
    let match;
    while ((match = pattern.exec(source))) found.push({ skill: normalizeSkill(candidate), start: match.index, end: match.index + match[0].length });
  }
  return found.sort((a, b) => a.start - b.start || b.end - a.end);
};
export const hasSoftSkill = (text) => SOFT_SKILLS.some((skill) =>
  new RegExp(`\\b${escapeRegExp(skill)}\\b`, 'i').test(normalizeBullet(text)));
export const outcomePhrase = (text) => {
  const normalized = normalizeBullet(text);
  const match = OUTCOME_PATTERNS.map((pattern) => normalized.match(pattern)).find(Boolean);
  return match?.[0] || null;
};
export const spansFor = (text) => [
  ...(startsWithActionVerb(text) ? [{ t: 'verb', start: 0, end: normalizeBullet(text).split(/\s+/)[0].length, text: normalizeBullet(text).split(/\s+/)[0] }] : []),
  ...skillOccurrences(text).map((span) => ({ t: 'skill', ...span, text: text.slice(span.start, span.end) })),
  ...(hasSoftSkill(text) ? (() => {
    const match = normalizeBullet(text).match(new RegExp(`\\b(?:${SOFT_SKILLS.map(escapeRegExp).join('|')})\\b`, 'i'));
    return match ? [{ t: 'soft', start: match.index, end: match.index + match[0].length, text: match[0] }] : [];
  })() : []),
  ...(outcomePhrase(text) ? (() => {
    const outcome = outcomePhrase(text);
    const start = normalizeBullet(text).toLowerCase().indexOf(outcome.toLowerCase());
    return [{ t: 'outcome', start, end: start + outcome.length, text: outcome }];
  })() : []),
  ...(() => {
    const source = normalizeBullet(text);
    const spans = [];
    const pattern = /\b\d+(?:\.\d+)?\s*(?:%|ms|s|x|k|m|million|billion|percent|days?|hours?)(?!\w)/gi;
    let match;
    while ((match = pattern.exec(source))) spans.push({ t: 'metric', start: match.index, end: match.index + match[0].length, text: match[0] });
    return spans;
  })(),
].sort((a, b) => a.start - b.start || a.end - b.end);

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
  for (const original of String(text || '').split(/\r?\n/)) {
    for (const raw of original.split(/;/u)) {
    const line = raw.replace(/^\s*(?:[-*•▪◦]|\d+[.)])\s*/, '').trim();
    if (!line) continue;
    const match = line.match(/^(?:must have|required|required skills|requirements?|qualifications?|you should have experience with|experience with)\s*:?\s*(.*)$/i);
    const value = match ? match[1] : (/^\s*(?:[-*•▪◦]|\d+[.)])/.test(raw) ? line : '');
    if (value) requirements.push(...value.split(/[,;|]|\band\b/iu).map((item) => item.replace(/^(?:required|required skills|must have)\s*:?\s*/i, '').replace(/[.;]$/, '').trim()));
    }
  }
  return [...new Set(requirements.filter((value) => value.length >= 2).map((value) => value.toLowerCase()))];
};

const dateRange = /(?:19|20)\d{2}\s*[-–—]\s*(?:(?:19|20)\d{2}|present|current)|(?:0?[1-9]|1[0-2])\/(?:19|20)\d{2}\s*[-–—]\s*(?:(?:0?[1-9]|1[0-2])\/(?:19|20)\d{2}|present|current)/iu;
const yearValues = (text) => [...String(text || '').matchAll(/(?:19|20)\d{2}/gu)].map((match) => Number(match[0]));
const duplicateSimilarity = (left, right) => {
  const a = new Set(normalizeText(left).split(/\s+/).filter((word) => word.length > 3));
  const b = new Set(normalizeText(right).split(/\s+/).filter((word) => word.length > 3));
  const overlap = [...a].filter((word) => b.has(word)).length;
  return overlap / Math.max(1, Math.min(a.size, b.size));
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

const rule = (id, category, status, points, possible, reason, span = null) => ({
  id, category, status, points, possible, reason, span,
});
const category = (name, possible, rules) => ({
  name, points: rules.reduce((sum, item) => sum + item.points, 0), possible, rules,
});

const roleRequirements = (jobDescription) => {
  const required = extractRequirements(jobDescription).map(normalizeSkill);
  const preferred = [];
  for (const line of String(jobDescription || '').split(/\r?\n/)) {
    if (/\b(?:preferred|nice to have|bonus|plus)\b/i.test(line)) {
    preferred.push(...line.replace(/^[^:]*:/, '').split(/[,;|]|\band\b/iu).map(normalizeSkill));
    }
  }
  return {
    required: [...new Set(required.filter((value) => value && !preferred.includes(value)))],
    preferred: [...new Set(preferred.filter(Boolean))],
  };
};

const makeSpan = (text, phrase) => {
  const start = normalizeText(text).indexOf(normalizeText(phrase));
  return start < 0 ? null : { start, end: start + phrase.length, text: phrase };
};

export const scoreRecruiter = (cv, jobDescription = '') => {
  const text = String(cv || '');
  const parsed = parseCV(text);
  const bullets = bulletsFromCV(text);
  const experienceText = bullets.join(' ');
  const skills = skillEvaluation(text);
  const requirements = roleRequirements(jobDescription);
  const occurrences = skillOccurrences(experienceText);
  const requiredMatches = requirements.required.filter((skill) => occurrences.some((item) => item.skill === skill));
  const preferredMatches = requirements.preferred.filter((skill) => occurrences.some((item) => item.skill === skill));
  const missingMustHave = requirements.required.filter((skill) => !requiredMatches.includes(skill));
  const roleRules = [
    rule('role.required-skills', 'roleMatch', missingMustHave.length ? 'fail' : 'pass', requiredMatches.length / Math.max(1, requirements.required.length) * 24, 24, `${requiredMatches.length}/${requirements.required.length} required skills evidenced in experience or projects.`),
    rule('role.preferred-skills', 'roleMatch', preferredMatches.length ? 'partial' : requirements.preferred.length ? 'fail' : 'pass', preferredMatches.length / Math.max(1, requirements.preferred.length) * 6, 6, `${preferredMatches.length}/${requirements.preferred.length} preferred skills evidenced.`),
  ];
  const metricShare = bullets.length ? bullets.filter(hasMetric).length / bullets.length : 0;
  const verbShare = bullets.length ? bullets.filter(startsWithActionVerb).length / bullets.length : 0;
  const outcomeShare = bullets.length ? bullets.filter((bullet) => Boolean(outcomePhrase(bullet))).length / bullets.length : 0;
  const ownershipShare = bullets.length ? bullets.filter((bullet) => /^(?:led|built|owned|designed|architected|engineered|managed)\b/i.test(normalizeBullet(bullet))).length / bullets.length : 0;
  const idealLength = bullets.length ? bullets.filter((bullet) => {
    const words = bullet.split(/\s+/).length;
    return words >= 10 && words <= 25;
  }).length / bullets.length : 0;
  const entryLabels = parsed.sections.filter((section) => ['experience', 'projects'].includes(section.name))
    .flatMap((section) => section.entries.map((entry) => entry.label || ''));
  const currentYear = new Date().getFullYear();
  const datedLabels = entryLabels.filter((label) => yearValues(label).length);
  const latestYear = datedLabels.length ? Math.max(...datedLabels.flatMap(yearValues)) : null;
  const recencyFactor = latestYear === null ? 0.8 : /present|current/i.test(entryLabels.join(' ')) ? 1 : clamp(1 - Math.max(0, currentYear - latestYear) * 0.05, 0.7, 1);
  const experienceRules = [
    rule('experience.action-verbs', 'experienceImpact', verbShare >= .8 ? 'pass' : verbShare >= .5 ? 'partial' : 'fail', verbShare * 5, 5, `${Math.round(verbShare * 100)}% of bullets start with a strong action verb.`),
    rule('experience.metrics', 'experienceImpact', metricShare >= .5 ? 'pass' : metricShare ? 'partial' : 'fail', clamp(metricShare / .5) * 6, 6, `${Math.round(metricShare * 100)}% of bullets include a result metric.`),
    rule('experience.outcomes', 'experienceImpact', outcomeShare >= .6 ? 'pass' : outcomeShare ? 'partial' : 'fail', outcomeShare * 8, 8, `${Math.round(outcomeShare * 100)}% of bullets state an outcome.`),
    rule('experience.ownership', 'experienceImpact', ownershipShare >= .5 ? 'pass' : ownershipShare ? 'partial' : 'fail', ownershipShare * 3, 3, `${Math.round(ownershipShare * 100)}% of bullets show ownership.`),
    rule('experience.length', 'experienceImpact', idealLength >= .6 ? 'pass' : idealLength ? 'partial' : 'fail', idealLength * 2, 2, `${Math.round(idealLength * 100)}% of bullets are 10–25 words.`),
    rule('experience.recency', 'experienceImpact', recencyFactor >= .9 ? 'pass' : 'partial', recencyFactor, 1, latestYear === null ? 'Dates were not clear enough to apply recency weighting.' : `Recent evidence factor: ${recencyFactor.toFixed(2)}.`),
  ];
  const headers = checkHeader(text);
  const sectionNames = parsed.sections.map((section) => section.name);
  const parseRules = [
    rule('parse.contact', 'parseability', headers.email && headers.phone ? 'pass' : 'partial', (Number(headers.email) + Number(headers.phone)) / 2 * 5, 5, 'Email and phone contact fields detected.'),
    rule('parse.text-layer', 'parseability', text.trim() ? 'pass' : 'fail', text.trim() ? 5 : 0, 5, text.trim() ? 'Text content is available to the scorer.' : 'No text content was detected.'),
    rule('parse.standard-sections', 'parseability', sectionNames.some((name) => ['experience', 'projects', 'education', 'skills'].includes(name)) ? 'pass' : 'fail', sectionNames.length ? (/\t/.test(text) ? 2 : 5) : 0, 5, /\t/.test(text) ? 'Tabular spacing may reduce single-column parseability.' : 'Standard section headings were checked.'),
  ];
  const structureRules = [
    rule('structure.experience', 'structure', sectionNames.includes('experience') || sectionNames.includes('projects') ? 'pass' : 'fail', sectionNames.includes('experience') || sectionNames.includes('projects') ? 4 : 0, 4, 'Experience or project evidence is present.'),
    rule('structure.skills', 'structure', sectionNames.includes('skills') ? 'pass' : 'partial', sectionNames.includes('skills') ? 3 : 0, 3, 'Skills section detected.'),
    rule('structure.education', 'structure', sectionNames.includes('education') ? 'pass' : 'partial', sectionNames.includes('education') ? 3 : 0, 3, 'Education section detected.'),
  ];
  const backedSkills = skills.skills.filter((skill) => experienceText.toLowerCase().includes(skill.toLowerCase()));
  const unsupportedSkills = skills.skills.filter((skill) => !backedSkills.includes(skill));
  const skillRules = [
    rule('skills.evidence', 'skills', skills.skills.length && backedSkills.length === skills.skills.length ? 'pass' : backedSkills.length ? 'partial' : 'fail', skills.skills.length ? backedSkills.length / skills.skills.length * 8 : 0, 8, `${backedSkills.length}/${skills.skills.length} listed skills appear in experience or project bullets.`),
  ];
  const education = parsed.sections.find((section) => section.name === 'education');
  const educationText = education ? education.entries.flatMap((entry) => [entry.label, ...entry.bullets]).join(' ') : '';
  const educationRules = [rule('education.details', 'education', educationText ? 'pass' : 'fail', educationText ? 5 : 0, 5, educationText ? 'Education details detected; prestige is not scored.' : 'No education section details detected.')];
  const languageChecks = qualityChecks(text);
  const languageRules = [
    rule('language.first-person', 'language', languageChecks.firstPerson.length ? 'fail' : 'pass', languageChecks.firstPerson.length ? 0 : 3, 3, `${languageChecks.firstPerson.length} first-person bullets detected.`),
    rule('language.passive-voice', 'language', languageChecks.passiveVoice.length <= 1 ? 'pass' : 'partial', languageChecks.passiveVoice.length <= 1 ? 2 : 1, 2, `${languageChecks.passiveVoice.length} passive-voice candidates detected.`),
    rule('language.filler', 'language', languageChecks.fillerPhrases.length ? 'partial' : 'pass', languageChecks.fillerPhrases.length ? 1 : 2, 2, `${languageChecks.fillerPhrases.length} filler-phrase candidates detected.`),
  ];
  const allCategories = [
    category('roleMatch', SCORE_MODEL.roleMatch, roleRules),
    category('experienceImpact', SCORE_MODEL.experienceImpact, experienceRules),
    category('parseability', SCORE_MODEL.parseability, parseRules),
    category('structure', SCORE_MODEL.structure, structureRules),
    category('skills', SCORE_MODEL.skills, skillRules),
    category('education', SCORE_MODEL.education, educationRules),
    category('language', SCORE_MODEL.language, languageRules),
  ];
  const raw = allCategories.reduce((sum, item) => sum + item.points, 0);
  const cap = missingMustHave.length >= 3 ? SCORE_MODEL.knockoutCaps.threeOrMore : missingMustHave.length === 2 ? SCORE_MODEL.knockoutCaps.two : missingMustHave.length === 1 ? SCORE_MODEL.knockoutCaps.one : 100;
  const penalties = [];
  const allBullets = bullets.map(normalizeBullet);
  const nearDuplicates = [];
  for (let index = 0; index < allBullets.length; index += 1) {
    for (let next = index + 1; next < allBullets.length; next += 1) {
      if (duplicateSimilarity(allBullets[index], allBullets[next]) >= .85) nearDuplicates.push([index, next]);
    }
  }
  if (nearDuplicates.length) penalties.push({ id: 'penalty.near-duplicate', category: 'experienceImpact', points: -2 * nearDuplicates.length, reason: `${nearDuplicates.length} near-duplicate bullet pair${nearDuplicates.length === 1 ? '' : 's'} detected.` });
  const ranges = parsed.sections.flatMap((section) => section.entries.map((entry) => entry.label).filter((label) => dateRange.test(label)));
  const years = ranges.flatMap(yearValues);
  if (years.length >= 4 && Math.max(...years) - Math.min(...years) >= 3 && ranges.length < 2) {
    penalties.push({ id: 'penalty.unexplained-gap', category: 'experienceImpact', points: -3, reason: 'Date ranges suggest a possible gap; add dates or context if the gap was intentional.' });
  }
  const gpas = [...text.matchAll(/\b(?:GPA|CGPA)\s*[:=]?\s*(\d(?:\.\d{1,2})?)/giu)].map((match) => match[1]);
  if (new Set(gpas).size > 1) penalties.push({ id: 'penalty.inconsistent-gpa', category: 'education', points: -5, reason: 'Multiple GPA values appear in the CV.' });
  const counts = skillOccurrences(experienceText).reduce((map, item) => map.set(item.skill, (map.get(item.skill) || 0) + 1), new Map());
  for (const [skill, count] of counts) {
    if (count > 3) penalties.push({ id: 'penalty.keyword-stuffing', category: 'roleMatch', points: -10, reason: `${skill} appears ${count} times in experience/project text; repeats above three are ignored.` });
  }
  const penaltyPoints = penalties.reduce((sum, item) => sum + item.points, 0);
  const score = Math.round(Math.max(0, Math.min(cap, raw + penaltyPoints)));
  return {
    rules_version: RULES_VERSION,
    score,
    confidence: jobDescription.trim() ? 'medium' : 'low',
    label: jobDescription.trim() ? 'role match' : 'generic role match',
    categories: allCategories,
    penalties,
    missingMustHave,
    requirements,
    unsupportedSkills,
    spans: bullets.flatMap((bullet) => spansFor(bullet).map((span) => ({ ...span, source: bullet }))),
    penalties,
    pointsLostToCap: Math.max(0, raw + penaltyPoints - score),
  };
};
