import { bulletsFromCV, checkHeader, combineChecklistScore, extractRequirements, hasMetric, hasSkillWord, hasSoftSkill, outcomePhrase, parseCV, qualityChecks, skillEvaluation, startsWithActionVerb, weakOpener } from './rules.js';
import { getDocument, GlobalWorkerOptions } from './vendor/pdf.min.mjs';
import { pagesToText } from './pdf.js';

const $ = (selector) => document.querySelector(selector);
const cv = $('#cv');
let activeController;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.mjs';

const hashText = (value) => {
  let hash = 2166136261;
  for (const character of value) { hash ^= character.codePointAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16);
};
const cacheKey = (bullet) => `cvscorer:bullet:v2:${hashText(bullet)}`;
const readCached = (bullet) => { try { return JSON.parse(localStorage.getItem(cacheKey(bullet))); } catch { return null; } };
const writeCached = (bullet, result) => { try { localStorage.setItem(cacheKey(bullet), JSON.stringify(result)); } catch { /* storage is optional */ } };

function numberScore(value) {
  const numbers = Object.values(value || {}).filter((item) => typeof item === 'number');
  return numbers.length ? numbers.reduce((sum, item) => sum + item, 0) / numbers.length : null;
}

function setGauge(score) {
  const percent = score === null ? 0 : Math.max(0, Math.min(1, score));
  $('#overall-score').textContent = score === null ? '—' : `${Math.round(percent * 100)}%`;
  $('#gauge-value').style.strokeDashoffset = `${314 - (314 * percent)}`;
}

function barChart(target, labels, values, max = 1) {
  const width = 480, row = 34, height = Math.max(90, labels.length * row + 12);
  target.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${labels.join(', ')} scores">` +
    labels.map((label, index) => {
      const value = Math.max(0, Math.min(max, values[index] || 0));
      const y = index * row + 8;
      return `<text class="bar-label" x="0" y="${y + 16}">${label}</text><rect class="bar" x="135" y="${y}" width="${300 * value / max}" height="20" rx="5"></rect><text class="bar-value" x="442" y="${y + 15}" text-anchor="end">${Math.round(value * 100)}%</text>`;
    }).join('') + '</svg>';
}

function renderCharts(results, parsed, matchResults = []) {
  const scores = results.map(numberScore).filter((value) => value !== null);
  const bulletAverage = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null;
  const average = combineChecklistScore(bulletAverage, matchResults.map((item) => item.score));
  const categoryValues = [
    results.length ? results.reduce((sum, result) => sum + Number(startsWithActionVerb(result.bullet) || false), 0) / results.length : 0,
    results.length ? results.reduce((sum, result) => sum + Number(hasMetric(result.bullet) || false), 0) / results.length : 0,
    bulletAverage || 0, skillEvaluation(cv.value).repeatedInExperience.length ? 1 : 0, Object.values(checkHeader(cv.value)).filter(Boolean).length / 5,
  ];
  barChart($('#category-chart'), ['Action verbs', 'Numbers', 'Outcomes', 'Skills', 'Header'], categoryValues);
  const sectionNames = ['experience', 'projects', 'education', 'skills'];
  const sectionValues = sectionNames.map((name) => {
    const section = parsed.sections.find((item) => item.name === name);
    return section ? Math.min(1, section.entries.reduce((sum, entry) => sum + entry.bullets.length, 0) / 5) : 0;
  });
  barChart($('#section-chart'), sectionNames, sectionValues);
  $('#bullet-chart').innerHTML = scores.length ? scores.map((score, index) => `<div class="bullet-bar" style="height:${Math.max(8, score * 110)}px" title="Bullet ${index + 1}: ${Math.round(score * 100)}%"><span>${Math.round(score * 100)}</span></div>`).join('') : '<span class="muted">No model scores returned.</span>';
  return average;
}

function annotate(text) {
  const outcome = outcomePhrase(text);
  const outcomeStart = outcome ? text.toLowerCase().indexOf(outcome.toLowerCase()) : -1;
  const chunks = outcomeStart >= 0
    ? [text.slice(0, outcomeStart), text.slice(outcomeStart, outcomeStart + outcome.length), text.slice(outcomeStart + outcome.length)]
    : [text];
  const annotateWords = (chunk) => chunk.split(/(\s+)/).map((word) => {
    const safeWord = escapeHtml(word);
    const clean = word.replace(/[^\w%.-]/g, '');
    if (startsWithActionVerb(clean)) return `<span class="annotated verb" title="Action verb">${safeWord}</span>`;
    if (/^\d+(?:\.\d+)?(?:%|ms|s|x|k|m)?$/i.test(clean)) return `<span class="annotated metric" title="Number or metric">${safeWord}</span>`;
    if (hasSkillWord(clean)) return `<span class="annotated skill" title="Hard skill">${safeWord}</span>`;
    if (hasSoftSkill(clean)) return `<span class="annotated soft" title="Soft skill">${safeWord}</span>`;
    return safeWord;
  }).join('');
  return chunks.map((chunk, index) => index === 1 ? `<span class="annotated outcome" title="Impact statement">${escapeHtml(chunk)}</span>` : annotateWords(chunk)).join('');
}

function renderAnnotated(parsed) {
  $('#annotated-cv').innerHTML = parsed.sections.map((section) => `<div class="cv-section"><h3>${escapeHtml(section.name)}</h3>` +
    section.entries.map((entry) => `<div class="cv-entry">${entry.label ? `<div class="cv-entry-label">${escapeHtml(entry.label)}</div>` : ''}${entry.bullets.map((bullet) => `<div class="cv-bullet">${annotate(bullet)}</div>`).join('')}</div>`).join('') + '</div>').join('');
}

function renderQuality(text) {
  const checks = qualityChecks(text);
  const rows = [
    ['Bullets over 30 words', checks.longBullets.length],
    ['Repeated openers', checks.repeatedOpeners.length],
    ['Passive voice', checks.passiveVoice.length],
    ['Filler phrases', checks.fillerPhrases.length],
    ['First-person pronouns', checks.firstPerson.length],
  ];
  $('#quality-checks').innerHTML = rows.map(([label, count]) => `<p><strong>${label}:</strong> ${count ? `${count} flagged` : 'none found'}</p>`).join('') +
    `<p><strong>Tense:</strong> ${checks.tense.currentRolePresent ? 'current role detected; review present tense' : 'review past tense for older roles'}</p>`;
}

function renderMatch(results) {
  const match = $('#match-chart');
  if (!results?.length) { match.className = 'chart empty-chart'; match.textContent = 'No requirements found.'; return; }
  match.className = 'chart';
  match.innerHTML = results.map((item) => `<p><strong>${escapeHtml(item.target)}</strong>: <span class="tag ${item.status === 'matched' ? 'outcome' : item.status === 'weak' ? 'soft' : 'verb'}">${escapeHtml(item.status)}</span></p>`).join('');
}

function renderReport(text, bullets, results, matchResults) {
  const parsed = parseCV(text);
  const average = renderCharts(results, parsed, matchResults);
  setGauge(average);
  $('#verdict').textContent = average === null
    ? 'No model scores returned; local checks are still shown below.'
    : matchResults.length
      ? `Job-aware checklist score: ${Math.round(average * 100)}% (70% bullet quality, 30% job match).`
      : average >= .7
        ? 'Strong checklist coverage; add a job description for a tailored score.'
        : 'Several checklist items need evidence or clearer outcomes.';
  renderAnnotated(parsed);
  renderQuality(text);
  renderMatch(matchResults);
  $('#report').hidden = false;
}

let latestReport;
$('#export-json').addEventListener('click', () => {
  if (!latestReport) return;
  const blob = new Blob([JSON.stringify(latestReport, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'cvscorer-report.json';
  link.click();
  URL.revokeObjectURL(link.href);
});
$('#print-report').addEventListener('click', () => window.print());

$('#theme').addEventListener('click', () => {
  document.body.classList.toggle('dark');
  $('#theme').textContent = document.body.classList.contains('dark') ? 'Light mode' : 'Dark mode';
});
async function loadPdf(file) {
  $('#filename').textContent = file?.name || 'No file selected';
  $('#pdf-error').hidden = true;
  if (!file) return;
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    $('#pdf-error').textContent = 'Please choose a PDF file.';
    $('#pdf-error').hidden = false;
    return;
  }
  try {
    const document = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items
        .filter((item) => typeof item.str === 'string' && item.str.trim())
        .map((item) => ({ str: item.str, x: item.transform?.[4] || 0, y: item.transform?.[5] || 0 })));
    }
    const text = pagesToText(pages);
    if (!text.trim()) throw new Error('This PDF has no selectable text. Scanned or image-only PDFs cannot be scored.');
    cv.value = text;
    $('#progress').textContent = `Loaded ${document.numPages} page${document.numPages === 1 ? '' : 's'} from ${file.name}.`;
  } catch (error) {
    $('#pdf-error').textContent = error.message.includes('no selectable text')
      ? error.message
      : 'Could not read this PDF. It may be scanned, encrypted, or damaged.';
    $('#pdf-error').hidden = false;
  }
}
$('#pdf-input').addEventListener('change', (event) => loadPdf(event.target.files[0]));
$('.choose-file-button').addEventListener('click', (event) => {
  event.preventDefault();
  $('#pdf-input').click();
});
$('.choose-file-button').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    $('#pdf-input').click();
  }
});
$('#drop-zone').addEventListener('dragover', (event) => event.preventDefault());
$('#drop-zone').addEventListener('drop', (event) => {
  event.preventDefault();
  loadPdf(event.dataTransfer.files[0]);
});
$('#score').addEventListener('click', async () => {
  activeController?.abort();
  activeController = new AbortController();
  const text = cv.value;
  const bullets = bulletsFromCV(text);
  if (!bullets.length) {
    $('#progress').textContent = cv.value.trim()
      ? 'Text loaded, but no achievement lines were detected under an Experience or Projects heading. Check that those headings are present.'
      : 'No CV text loaded. Choose a PDF or paste CV text first.';
    return;
  }
  const results = Array(bullets.length);
  const pending = [];
  bullets.forEach((bullet, index) => { const cached = readCached(bullet); if (cached) results[index] = { ...cached, bullet }; else pending.push({ bullet, index }); });
  $('#progress').textContent = `Scored ${bullets.length - pending.length}/${bullets.length}`;
  try {
    if (pending.length) {
      const response = await fetch('/api/bullets', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ bullets: pending.map((item) => item.bullet) }), signal: activeController.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Request failed');
      data.results.forEach((result, index) => { const item = pending[index]; results[item.index] = { ...result, bullet: item.bullet }; if (!result.error) writeCached(item.bullet, result); });
    }
    $('#progress').textContent = `Scored ${results.filter(Boolean).length}/${bullets.length}`;
    let matchResults = [];
    const requirements = extractRequirements($('#job-description').value);
    if (requirements.length) {
      const matchResponse = await fetch('/api/match', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({ cv: text, targets: requirements }), signal: activeController.signal });
      const matchData = await matchResponse.json();
      if (!matchResponse.ok) throw new Error(matchData.error || 'Job match request failed');
      matchResults = matchData.results || [];
    }
    const bulletScore = results.map(numberScore).filter((score) => score !== null);
    const bulletAverage = bulletScore.length ? bulletScore.reduce((sum, score) => sum + score, 0) / bulletScore.length : null;
    latestReport = {
      cv: text, bullets, results, requirements, matchResults,
      overallScore: combineChecklistScore(bulletAverage, matchResults.map((item) => item.score)),
      quality: qualityChecks(text), generatedAt: new Date().toISOString(),
    };
    renderReport(text, bullets, results, matchResults);
  } catch (error) {
    if (error.name !== 'AbortError') $('#progress').textContent = `Error: ${error.message}`;
  }
});
