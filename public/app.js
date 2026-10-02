import { bulletsFromCV, checkHeader, extractRequirements, hasMetric, hasSkillWord, hasSoftSkill, outcomePhrase, parseCV, qualityChecks, scoreRecruiter, skillEvaluation, spansFor, startsWithActionVerb, weakOpener } from './rules.js';
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

function renderCharts(results, parsed, recruiterScore) {
  const scores = results.map(numberScore).filter((value) => value !== null);
  const categoryValues = [
    ...(recruiterScore ? ['roleMatch', 'experienceImpact', 'parseability', 'structure', 'skills', 'education', 'language'].map((name) => {
      const item = recruiterScore.categories.find((category) => category.name === name);
      return item ? item.points / item.possible : 0;
    }) : [0, 0, 0, 0, 0, 0, 0]),
  ];
  barChart($('#category-chart'), ['Role match', 'Experience', 'Parseability', 'Structure', 'Skills', 'Education', 'Language'], categoryValues);
  const sectionNames = ['experience', 'projects', 'education', 'skills'];
  const sectionValues = sectionNames.map((name) => {
    const section = parsed.sections.find((item) => item.name === name);
    return section ? Math.min(1, section.entries.reduce((sum, entry) => sum + entry.bullets.length, 0) / 5) : 0;
  });
  barChart($('#section-chart'), sectionNames, sectionValues);
  $('#bullet-chart').innerHTML = scores.length ? scores.map((score, index) => `<div class="bullet-bar" style="height:${Math.max(8, score * 110)}px" title="Bullet ${index + 1}: ${Math.round(score * 100)}%"><span>${Math.round(score * 100)}</span></div>`).join('') : '<span class="muted">No model scores returned.</span>';
  return recruiterScore?.score ?? null;
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

function renderScoreDetails(score) {
  if (!score) return;
  const categoryRows = score.categories.map((item) =>
    `<div class="score-row"><span>${escapeHtml(item.name)}</span><strong>${item.points.toFixed(1)} / ${item.possible}</strong></div>`).join('');
  const penalties = score.penalties?.length
    ? score.penalties.map((item) => `<div class="rule-row"><strong>${escapeHtml(item.id)}</strong><span class="rule-status fail">${item.points} points</span><p>${escapeHtml(item.reason)}</p></div>`).join('')
    : '<p class="muted">No deterministic penalties detected.</p>';
  const rules = score.categories.flatMap((item) => item.rules).filter((item) => item.status !== 'pass')
    .sort((left, right) => (right.possible - right.points) - (left.possible - left.points)).slice(0, 5)
    .map((item) => `<div class="rule-row"><strong>${escapeHtml(item.id)}</strong> <span class="rule-status ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span><p>${escapeHtml(item.reason)}</p></div>`).join('');
  $('#score-summary').innerHTML = `<p><strong>Confidence:</strong> ${escapeHtml(score.confidence)}. <strong>Model:</strong> ${escapeHtml(score.rules_version)}.</p>` +
    `<p>${score.missingMustHave?.length ? `<strong>Missing must-have:</strong> ${escapeHtml(score.missingMustHave.join(', '))}.` : 'No missing must-have skills detected.'}</p>` +
    `<p>${score.unsupportedSkills?.length ? `<strong>Unsupported listed skills:</strong> ${escapeHtml(score.unsupportedSkills.join(', '))}.` : 'All listed skills have supporting experience or project evidence.'}</p>` +
    `<div class="score-summary">${categoryRows}</div><h3>Penalties</h3>${penalties}<h3>Largest rule-level losses</h3>${rules || '<p class="muted">No rule losses detected.</p>'}`;
}

function renderSemantic(results) {
  const target = $('#semantic-results');
  if (!results?.length) {
    target.innerHTML = '';
    return;
  }

  const semanticCacheKey = (text, job) => `cvscorer:semantic:v1:${hashText(`${text}\n${job}`)}`;
  const readSemanticCache = (text, job) => {
    try { return JSON.parse(localStorage.getItem(semanticCacheKey(text, job))); } catch { return null; }
  };
  const writeSemanticCache = (text, job, result) => {
    try { localStorage.setItem(semanticCacheKey(text, job), JSON.stringify(result)); } catch { /* storage is optional */ }
  };
  target.innerHTML = '<h3>Optional semantic review</h3>' + results.map((item) =>
    `<div class="semantic-result"><strong>${escapeHtml(item.bullet)}</strong><p>Result: ${item.result.toFixed(2)} · Relevance: ${item.relevance.toFixed(2)} · Skill evidence: ${item.skillEvidence.toFixed(2)} · Credibility: ${item.credibility.toFixed(2)}</p></div>`).join('');
}

function renderMatch(results) {
  const match = $('#match-chart');
  if (!results?.length) { match.className = 'chart empty-chart'; match.textContent = 'No requirements found.'; return; }
  match.className = 'chart';
  match.innerHTML = results.map((item) => `<p><strong>${escapeHtml(item.target)}</strong>: <span class="tag ${item.status === 'matched' ? 'outcome' : item.status === 'weak' ? 'soft' : 'verb'}">${escapeHtml(item.status)}</span></p>`).join('');
}

function renderReport(text, bullets, results, matchResults, recruiterScore) {
  const parsed = parseCV(text);
  const score = renderCharts(results, parsed, recruiterScore);
  setGauge(score === null ? null : score / 100);
  $('#verdict').textContent = score === null
    ? 'No model scores returned; local checks are still shown below.'
    : recruiterScore?.missingMustHave?.length
      ? `${recruiterScore.missingMustHave.length} required skill${recruiterScore.missingMustHave.length === 1 ? '' : 's'} missing; the score is capped until addressed.`
      : score >= 70
        ? 'Strong recruiter-style checklist coverage; review the top point losses below.'
        : 'Several checklist items need evidence or clearer outcomes.';
  renderAnnotated(parsed);
  renderQuality(text);
  renderMatch(matchResults);
  renderScoreDetails(recruiterScore);
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
$('#semantic-score').addEventListener('click', async () => {
  const text = cv.value.trim();
  const bullets = bulletsFromCV(text);
  if (!bullets.length) {
    $('#progress').textContent = 'Score the CV first or add experience/project bullets before running semantic review.';
    return;
  }
  try {
    const job = $('#job-description').value;
    const cached = readSemanticCache(text, job);
    let semanticResults = cached;
    if (!semanticResults) {
      $('#progress').textContent = 'Running optional semantic review…';
      semanticResults = [];
      for (let index = 0; index < bullets.length; index += 8) {
        const response = await fetch('/api/semantic', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ bullets: bullets.slice(index, index + 8), target: extractRequirements(job)[0] || '' }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Semantic review failed');
        semanticResults.push(...(data.results || []));
      }
      writeSemanticCache(text, job, semanticResults);
    }
    renderSemantic(semanticResults);
    if (latestReport) {
      latestReport.semantic = semanticResults;
      renderSemantic(semanticResults);
    }
    $('#progress').textContent = 'Semantic review complete. It supplements, but does not replace, deterministic scoring.';
  } catch (error) {
    $('#progress').textContent = `Semantic review unavailable: ${error.message}`;
  }
});

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
    const recruiterScore = scoreRecruiter(text, $('#job-description').value);
    latestReport = {
      cv: text, bullets, results, requirements, matchResults,
      recruiterScore,
      overallScore: recruiterScore.score,
      quality: qualityChecks(text), generatedAt: new Date().toISOString(),
    };
    renderReport(text, bullets, results, matchResults, recruiterScore);
  } catch (error) {
    if (error.name !== 'AbortError') $('#progress').textContent = `Error: ${error.message}`;
  }
});
