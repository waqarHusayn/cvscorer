import { ACTION_VERBS, SKILLS } from './config.js';
const metric = /(?:\b\d+(?:\.\d+)?\s*%|\b\d+(?:\.\d+)?\s*(?:percent|x|k|m|million|billion)\b)/i;
export const extractBullets = (text) => text.split(/\r?\n/)
  .filter((line) => /^\s*(?:[-*•▪◦]|\d+[.)])\s+/.test(line))
  .map((line) => line.replace(/^\s*(?:[-*•▪◦]|\d+[.)])\s*/, '').trim())
  .filter(Boolean);
export const startsWithActionVerb = (text) => ACTION_VERBS.includes(text.trim().split(/\s+/)[0].toLowerCase().replace(/[,:;.]$/, ''));
export const hasMetric = (text) => metric.test(text);
export const hasSkillWord = (text) => SKILLS.some((skill) => new RegExp(`\\b${skill.replace(/[.+-]/g, '\\$&')}\\b`, 'i').test(text));
export const spansFor = (text) => [
  ...(startsWithActionVerb(text) ? [{ t: 'verb' }] : []),
  ...(hasMetric(text) ? [{ t: 'metric' }] : []),
  ...(hasSkillWord(text) ? [{ t: 'skill' }] : []),
];
export const checkHeader = (text) => ({ email: /[\w.+-]+@[\w.-]+\.\w+/.test(text), phone: /\+?\d[\d ()-]{7,}\d/.test(text), linkedin: /linkedin\.com\/in\//i.test(text) });
