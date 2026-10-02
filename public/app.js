import { extractBullets, checkHeader, startsWithActionVerb, hasMetric, hasSkillWord } from './rules.js';
const cv = document.querySelector('#cv'), out = document.querySelector('#out');
const fallbackBullets = (text) => text.split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.length >= 20)
  .filter((line) => !/^(?:experience|education|skills|projects|summary|contact|work history|technical skills)$/i.test(line))
  .slice(0, 40);
document.querySelector('#score').addEventListener('click', async () => {
  const text = cv.value;
  const bullets = extractBullets(text);
  const scorableBullets = bullets.length ? bullets : fallbackBullets(text);
  if (!scorableBullets.length) {
    out.textContent = 'No scorable CV text found. Paste your CV, with one achievement per line.';
    return;
  }
  out.textContent = `Local checks\nBullets: ${bullets.length}\nHeader: ${JSON.stringify(checkHeader(text))}\n\nContacting Jev...`;
  try {
    const response = await fetch('/api/bullets', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ bullets: scorableBullets }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed');
    const values = data.results.map((result) => {
      if (result.error) return null;
      const numbers = Object.values(result).filter((value) => typeof value === 'number');
      return numbers.length ? numbers.reduce((sum, value) => sum + value, 0) / numbers.length : null;
    });
    const validValues = values.filter((value) => value !== null);
    const overall = validValues.length ? validValues.reduce((sum, value) => sum + value, 0) / validValues.length : null;
    out.textContent = `${overall === null ? 'No model scores returned' : `Overall model score: ${(overall * 100).toFixed(0)}%`}\n\n` +
      scorableBullets.map((bullet, i) => {
        const result = data.results[i];
        const score = values[i] === null ? (result.error || 'No score') : `${(values[i] * 100).toFixed(0)}%`;
        return `${i + 1}. ${bullet}\n   Score: ${score}\n   Local checks: verb=${startsWithActionVerb(bullet)} metric=${hasMetric(bullet)} skill=${hasSkillWord(bullet)}`;
      }).join('\n\n');
  } catch (error) { out.textContent = `Error: ${error.message}`; }
});
