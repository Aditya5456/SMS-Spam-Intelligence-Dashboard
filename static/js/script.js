/* ==========================================================================
   SMS Spam Intelligence Dashboard - frontend logic (vanilla JavaScript)
   Every value displayed here comes from the Flask backend via fetch().
   ========================================================================== */
'use strict';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const ui = {
  previewPage: 1,
  previewPages: 1,
  previewLabel: 'all',
  previewSearch: '',
  previewPerPage: 25,
  poly: null,
  isSample: true,
  thresholds: [],
  history: [],
};

/* ---------------------------------------------------------------- helpers */
async function api(path, options = {}) {
  let res;
  try {
    res = await fetch(path, options);
  } catch (e) {
    throw new Error('Cannot reach the Flask server. Make sure "python app.py" is still running.');
  }
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error(`The server returned an unexpected response (HTTP ${res.status}).`);
  }
  if (!res.ok || data.ok === false) {
    const err = new Error(data.error || `Request failed (HTTP ${res.status}).`);
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

function postJSON(path, body) {
  return api(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
}

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
const pct = (v, d = 2) => (v === null || v === undefined ? 'n/a' : `${(v * 100).toFixed(d)}%`);
const fmt = (n) => (n === null || n === undefined ? 'n/a' : Number(n).toLocaleString('en-US'));
const num = (v, d = 3) => (v === null || v === undefined ? 'n/a' : Number(v).toFixed(d));
const cap = (s) => String(s).charAt(0).toUpperCase() + String(s).slice(1);

function errorBox(err) {
  return `<div class="alert alert-error">${esc(err && err.message ? err.message : err)}</div>`;
}
function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

let toastTimer = null;
function toast(message) {
  const t = $('#toast');
  t.textContent = message;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3200);
}

function busy(on, text) {
  $('#busyText').textContent = text || 'Working…';
  $('#busy').classList.toggle('hidden', !on);
  const skip = ['themeToggle', 'prevPage', 'nextPage'];
  $$('button').forEach((b) => { if (!skip.includes(b.id)) b.disabled = on; });
}

function labelBadge(label) {
  return `<span class="badge badge-${label === 'spam' ? 'spam' : 'ham'}">${esc(label)}</span>`;
}

function metricStrip(m) {
  const items = [
    ['Accuracy', m.accuracy], ['Precision', m.precision], ['Recall', m.recall],
    ['F1-score', m.f1], ['Specificity', m.specificity], ['ROC-AUC', m.roc_auc],
  ];
  return `<div class="metric-strip">${items.map(([k, v]) =>
    `<div><div class="v">${k === 'ROC-AUC' ? num(v, 4) : pct(v)}</div><div class="k">${k}</div></div>`).join('')}</div>`;
}

/* ---------------------------------------------------------------- charts */
const renderers = {};
let plotlyPromise = null;

function whenPlotly() {
  if (!plotlyPromise) {
    plotlyPromise = new Promise((resolve, reject) => {
      const start = Date.now();
      (function check() {
        if (window.Plotly) return resolve(window.Plotly);
        if (Date.now() - start > 15000) return reject(new Error('Charts could not be loaded (Plotly.js is missing). Tables and numbers still work.'));
        setTimeout(check, 100);
      })();
    });
  }
  return plotlyPromise;
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
function palette() {
  return {
    ham: cssVar('--ham'), spam: cssVar('--spam'), accent: cssVar('--accent'), ink: cssVar('--ink'),
    muted: cssVar('--muted'), line: cssVar('--line'), warn: cssVar('--warn'), surface: cssVar('--surface'),
  };
}
function rgba(hex, alpha) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function layout(c, title, extra = {}) {
  const axis = { gridcolor: c.line, zerolinecolor: c.line, linecolor: c.line, automargin: true };
  const base = {
    title: { text: title, font: { size: 15, color: c.ink }, x: 0.02, xanchor: 'left' },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { family: 'IBM Plex Sans, Segoe UI, system-ui, sans-serif', color: c.ink, size: 12 },
    margin: { l: 56, r: 20, t: 52, b: 104 },
    legend: { orientation: 'h', x: 0, y: -0.3, yanchor: 'top' },
    hoverlabel: { font: { family: 'IBM Plex Sans, sans-serif' } },
  };
  const out = Object.assign({}, base, extra);
  out.xaxis = Object.assign({}, axis, extra.xaxis || {});
  out.yaxis = Object.assign({}, axis, extra.yaxis || {});
  return out;
}

function draw(id, builder) {
  renderers[id] = builder;
  const el = document.getElementById(id);
  if (!el) return;
  whenPlotly().then((P) => {
    const empty = el.querySelector('.chart-empty');
    if (empty) empty.remove();
    const { data, layout: lay } = builder(palette());
    P.react(el, data, lay, { responsive: true, displaylogo: false, modeBarButtonsToRemove: ['lasso2d', 'select2d'] });
  }).catch((e) => chartMessage(id, e.message));
}

function chartMessage(id, message) {
  const el = document.getElementById(id);
  if (!el) return;
  delete renderers[id];
  if (window.Plotly) window.Plotly.purge(el);
  el.innerHTML = `<div class="chart-empty">${esc(message)}</div>`;
}

function redrawAll() {
  Object.keys(renderers).forEach((id) => draw(id, renderers[id]));
}

/* ---------------------------------------------------------------- status + hero */
async function loadStatus() {
  const s = await api('/api/status');
  ui.isSample = s.is_sample;
  if (!s.loaded) {
    $('#heroSource').textContent = 'No dataset loaded. Upload a CSV or reset to the sample dataset.';
    return s;
  }
  setSvmControls(s.svm_params);
  setBlrControls(s.blr_params);
  return s;
}

function updateHero(o) {
  $('#heroSource').innerHTML = o.is_sample
    ? `Built-in sample dataset (${fmt(o.total)} messages). Upload the Kaggle file for the real project results.`
    : `Dataset: <b>${esc(o.source_name)}</b> (${fmt(o.total)} messages)`;
  $('#signalHam').style.width = `${o.ham_pct}%`;
  $('#signalSpam').style.width = `${o.spam_pct}%`;
  $('#heroHam').textContent = `${fmt(o.ham)} (${o.ham_pct.toFixed(2)}%)`;
  $('#heroSpam').textContent = `${fmt(o.spam)} (${o.spam_pct.toFixed(2)}%)`;
  $('#signalStrip').setAttribute('aria-label', `${o.ham_pct.toFixed(1)}% ham, ${o.spam_pct.toFixed(1)}% spam`);
}

function updateHeroModel(svm) {
  if (!svm) return;
  const p = svm.params;
  $('#heroModel').textContent = `SVM: ${p.kernel} kernel, C=${p.C}`;
  $('#heroAcc').textContent = `Measured SVM test F1 ${pct(svm.metrics.f1)}, accuracy ${pct(svm.metrics.accuracy)}`;
}

/* ---------------------------------------------------------------- upload */
function initUpload() {
  const input = $('#fileInput');
  const dz = $('#dropzone');
  input.addEventListener('change', () => {
    $('#fileName').textContent = input.files[0] ? `Selected: ${input.files[0].name}` : 'Expected: a label column (ham / spam) and a message column';
  });
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', (e) => {
    if (e.dataTransfer.files.length) {
      input.files = e.dataTransfer.files;
      input.dispatchEvent(new Event('change'));
    }
  });

  $('#uploadForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const file = input.files[0];
    if (!file) {
      showUploadMessage(errorBox('Choose a CSV file first (for example spam.csv from Kaggle).'));
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    doUpload(fd);
  });

  $('#mappingBtn').addEventListener('click', () => {
    const fd = new FormData();
    fd.append('label_col', $('#labelColSelect').value);
    fd.append('text_col', $('#textColSelect').value);
    doUpload(fd);
  });

  $('#resetBtn').addEventListener('click', async () => {
    busy(true, 'Loading the sample dataset and retraining…');
    try {
      await postJSON('/api/reset');
      hideMapping();
      showUploadMessage('<div class="alert alert-info">Sample dataset loaded and models retrained.</div>');
      clearExperimentPanels();
      await refreshAll();
      toast('Sample dataset loaded');
    } catch (err) {
      showUploadMessage(errorBox(err));
    } finally {
      busy(false);
    }
  });
}

async function doUpload(formData) {
  busy(true, 'Uploading, validating and training the models…');
  try {
    const res = await api('/api/upload', { method: 'POST', body: formData });
    hideMapping();
    const r = res.report;
    showUploadMessage(`
      <div class="alert alert-success">
        <strong>${esc(res.message)}</strong>
        <p style="margin:.3rem 0 0">File <b>${esc(res.source_name)}</b>, label column <b>${esc(res.columns_used.label)}</b>, text column <b>${esc(res.columns_used.text)}</b>
        ${res.auto_detected ? '(detected automatically)' : '(selected manually)'}.</p>
        <ul>
          <li>${fmt(r.raw_rows)} rows read, ${fmt(r.valid_rows)} valid messages kept.</li>
          <li>${fmt(r.missing_values)} missing values, ${fmt(r.empty_messages)} empty messages and ${fmt(r.unexpected_labels)} rows with unexpected labels removed${r.unexpected_label_examples.length ? ` (e.g. ${esc(r.unexpected_label_examples.join(', '))})` : ''}.</li>
          <li>${fmt(r.duplicates)} duplicate messages found (kept in the overview, removed before training).</li>
          <li>Models retrained automatically on the new data.</li>
        </ul>
      </div>`);
    clearExperimentPanels();
    await refreshAll();
    toast('Dataset uploaded successfully');
  } catch (err) {
    if (err.data && err.data.needs_mapping && err.data.columns) {
      showMapping(err.data, err.message);
      showUploadMessage('');
    } else {
      showUploadMessage(errorBox(err));
    }
  } finally {
    busy(false);
  }
}

function showUploadMessage(html) {
  const box = $('#uploadStatus');
  box.innerHTML = html;
  box.classList.toggle('hidden', !html);
}

function showMapping(data, message) {
  const panel = $('#mappingPanel');
  $('#mappingMsg').textContent = message;
  const options = data.columns.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  $('#labelColSelect').innerHTML = options;
  $('#textColSelect').innerHTML = options;
  const det = data.detected || {};
  if (det.label) $('#labelColSelect').value = det.label;
  if (det.text) $('#textColSelect').value = det.text;
  else if (data.columns.length > 1) $('#textColSelect').value = data.columns[1];
  if (data.sample_rows && data.sample_rows.length) {
    $('#mappingHead').innerHTML = `<tr>${data.columns.map((c) => `<th>${esc(c)}</th>`).join('')}</tr>`;
    $('#mappingBody').innerHTML = data.sample_rows.map((row) =>
      `<tr>${row.map((v) => `<td>${esc(String(v).slice(0, 80))}</td>`).join('')}</tr>`).join('');
    $('#mappingPreviewWrap').classList.remove('hidden');
  } else {
    $('#mappingPreviewWrap').classList.add('hidden');
  }
  panel.classList.remove('hidden');
}

function hideMapping() {
  $('#mappingPanel').classList.add('hidden');
}

function clearExperimentPanels() {
  setHTML('predictResult', '<p class="muted">The prediction will appear here.</p>');
  ui.history = [];
  renderHistory();
}

/* ---------------------------------------------------------------- overview */
async function loadOverview() {
  try {
    const o = await api('/api/overview');
    updateHero(o);
    $('#overviewSource').textContent = o.is_sample
      ? `Source: built-in sample dataset (sample_sms.csv). Upload the Kaggle spam.csv for the real results.`
      : `Source: ${o.source_name}`;
    const cards = [
      ['Total Messages', fmt(o.total), ''],
      ['Spam Messages', fmt(o.spam), 'spam'],
      ['Ham Messages', fmt(o.ham), 'ham'],
      ['Spam Percentage', `${o.spam_pct.toFixed(2)}%`, 'spam'],
      ['Ham Percentage', `${o.ham_pct.toFixed(2)}%`, 'ham'],
      ['Duplicate Messages', fmt(o.duplicates), ''],
      ['Missing Values', fmt(o.missing_values), ''],
      ['Unique messages used for modelling', fmt(o.unique_messages), ''],
      ['Training set', `${fmt(o.train_size)}`, ''],
      ['Test set', `${fmt(o.test_size)}`, ''],
    ];
    setHTML('overviewCards', cards.map(([k, v, cls]) =>
      `<div class="stat ${cls}"><div class="v">${v}</div><div class="k">${esc(k)}</div></div>`).join(''));
    $('#overviewNote').innerHTML = `${fmt(o.raw_rows)} rows were read from the file; ${fmt(o.removed_rows)} were removed during validation (missing values, empty messages or labels other than ham/spam). `
      + `Duplicates are counted here but removed before the 80/20 stratified split, leaving ${fmt(o.train_size)} training messages (${fmt(o.train_spam)} spam) and ${fmt(o.test_size)} test messages (${fmt(o.test_spam)} spam).`;
  } catch (err) {
    setHTML('overviewCards', errorBox(err));
  }
}

/* ---------------------------------------------------------------- preview */
function highlight(text, term) {
  if (!term) return esc(text);
  const lower = text.toLowerCase();
  const t = term.toLowerCase();
  let out = '';
  let i = 0;
  let j;
  while ((j = lower.indexOf(t, i)) !== -1) {
    out += esc(text.slice(i, j)) + `<mark>${esc(text.slice(j, j + t.length))}</mark>`;
    i = j + t.length;
  }
  return out + esc(text.slice(i));
}

async function loadPreview() {
  const params = new URLSearchParams({
    page: ui.previewPage, per_page: ui.previewPerPage, search: ui.previewSearch, label: ui.previewLabel,
  });
  try {
    const p = await api(`/api/preview?${params}`);
    ui.previewPage = p.page;
    ui.previewPages = p.pages;
    $('#previewBody').innerHTML = p.rows.length
      ? p.rows.map((r) => `<tr><td class="num">${r.row}</td><td>${labelBadge(r.label)}</td><td class="msg-cell">${highlight(r.message, ui.previewSearch)}</td></tr>`).join('')
      : '<tr><td colspan="3" class="muted">No messages match this search.</td></tr>';
    $('#pageInfo').textContent = `Page ${p.page} of ${p.pages} (${fmt(p.total)} messages)`;
    $('#prevPage').disabled = p.page <= 1;
    $('#nextPage').disabled = p.page >= p.pages;
  } catch (err) {
    $('#previewBody').innerHTML = `<tr><td colspan="3">${errorBox(err)}</td></tr>`;
  }
}

function initPreview() {
  let timer = null;
  $('#previewSearch').addEventListener('input', (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { ui.previewSearch = e.target.value.trim(); ui.previewPage = 1; loadPreview(); }, 250);
  });
  $$('.seg').forEach((b) => b.addEventListener('click', () => {
    $$('.seg').forEach((x) => x.classList.remove('active'));
    b.classList.add('active');
    ui.previewLabel = b.dataset.label;
    ui.previewPage = 1;
    loadPreview();
  }));
  $('#previewPerPage').addEventListener('change', (e) => { ui.previewPerPage = Number(e.target.value); ui.previewPage = 1; loadPreview(); });
  $('#prevPage').addEventListener('click', () => { if (ui.previewPage > 1) { ui.previewPage -= 1; loadPreview(); } });
  $('#nextPage').addEventListener('click', () => { if (ui.previewPage < ui.previewPages) { ui.previewPage += 1; loadPreview(); } });
}

/* ---------------------------------------------------------------- preprocessing */
async function loadPreprocess() {
  try {
    const p = await api('/api/preprocess');
    setHTML('preprocessExamples', p.examples.map((ex, i) => `
      <div class="example">
        <div class="example-head">Example ${i + 1} ${labelBadge(ex.label)}</div>
        <dl>
          <dt>Original message</dt><dd>${esc(ex.original)}</dd>
          <dt>1. HTML codes decoded</dt><dd>${esc(ex.decode_html)}</dd>
          <dt>2. Lowercase</dt><dd>${esc(ex.lowercase)}</dd>
          <dt>3. Links and currency replaced</dt><dd>${esc(ex.replace_links_money)}</dd>
          <dt>4. Punctuation removed</dt><dd>${esc(ex.remove_punctuation)}</dd>
          <dt>5. Extra spaces removed</dt><dd>${esc(ex.remove_whitespace)}</dd>
          <dt>6. After stopword removal</dt><dd>${ex.tokens_after_stopwords.map(esc).join(' ') || '<span class="muted">(no words left)</span>'}${ex.stopwords_removed.length ? `<br><span class="tok-removed">${ex.stopwords_removed.map(esc).join(' ')}</span> <span class="muted">(removed)</span>` : ''}</dd>
        </dl>
      </div>`).join(''));
    $('#preprocessStats').textContent = `Measured on the loaded data: an average message has ${num(p.avg_tokens_raw, 1)} words before cleaning and ${num(p.avg_tokens_clean, 1)} informative words after cleaning and removing ${p.n_stopwords} stopwords.`;
  } catch (err) {
    setHTML('preprocessExamples', errorBox(err));
  }
}

/* ---------------------------------------------------------------- EDA */
async function loadEDA() {
  try {
    const e = await api('/api/eda');
    const total = e.counts.ham + e.counts.spam;
    draw('classBarChart', (c) => ({
      data: [{
        type: 'bar', x: ['Ham', 'Spam'], y: [e.counts.ham, e.counts.spam],
        marker: { color: [c.ham, c.spam] }, text: [fmt(e.counts.ham), fmt(e.counts.spam)], textposition: 'outside',
        hovertemplate: '%{x}: %{y} messages<extra></extra>',
      }],
      layout: layout(c, 'Number of messages per class', { yaxis: { title: { text: 'Messages' } }, showlegend: false }),
    }));
    draw('classPieChart', (c) => ({
      data: [{
        type: 'pie', labels: ['Ham', 'Spam'], values: [e.counts.ham, e.counts.spam], hole: 0.55, sort: false,
        marker: { colors: [c.ham, c.spam], line: { color: c.surface, width: 2 } },
        textinfo: 'label+percent', hovertemplate: '%{label}: %{value} (%{percent})<extra></extra>',
      }],
      layout: layout(c, 'Class percentage', { showlegend: false }),
    }));
    const hamPct = (100 * e.counts.ham / total).toFixed(2);
    $('#classNote').textContent = `Ham outnumbers spam by ${num(e.imbalance_ratio, 2)} to 1, so the dataset is imbalanced. A useless model that always answers "ham" would already be ${hamPct}% accurate on this data, which is why precision, recall and F1-score for the spam class are reported alongside accuracy. The train/test split is stratified so both sets keep this ratio.`;

    draw('lengthHistChart', (c) => ({
      data: [
        { type: 'histogram', x: e.lengths.ham, name: 'Ham', marker: { color: rgba(c.ham, 0.7) }, nbinsx: 50 },
        { type: 'histogram', x: e.lengths.spam, name: 'Spam', marker: { color: rgba(c.spam, 0.7) }, nbinsx: 50 },
      ],
      layout: layout(c, 'Message length distribution (characters)', {
        barmode: 'overlay', xaxis: { title: { text: 'Characters per message' } }, yaxis: { title: { text: 'Messages' } },
      }),
    }));
    draw('lengthBoxChart', (c) => ({
      data: [
        { type: 'box', y: e.lengths.ham, name: 'Ham', marker: { color: c.ham }, boxmean: true },
        { type: 'box', y: e.lengths.spam, name: 'Spam', marker: { color: c.spam }, boxmean: true },
      ],
      layout: layout(c, 'Spam vs ham message length', { yaxis: { title: { text: 'Characters' } }, showlegend: false }),
    }));
    const s = e.stats;
    setHTML('lengthStatsTable', `
      <thead><tr><th>Class</th><th class="num">Messages</th><th class="num">Avg characters</th><th class="num">Median characters</th><th class="num">Avg words</th><th class="num">Shortest</th><th class="num">Longest</th></tr></thead>
      <tbody>${[['Ham', s.ham], ['Spam', s.spam], ['All', s.all]].map(([k, v]) =>
        `<tr><td>${k}</td><td class="num">${fmt(v.count)}</td><td class="num">${num(v.avg_chars, 1)}</td><td class="num">${num(v.median_chars, 0)}</td><td class="num">${num(v.avg_words, 1)}</td><td class="num">${fmt(v.min_chars)}</td><td class="num">${fmt(v.max_chars)}</td></tr>`).join('')}</tbody>`);

    const wordChart = (id, words, colorKey, title) => draw(id, (c) => ({
      data: [{
        type: 'bar', orientation: 'h', x: words.map((w) => w.count).reverse(), y: words.map((w) => w.word).reverse(),
        marker: { color: c[colorKey] }, hovertemplate: '%{y}: %{x}<extra></extra>',
      }],
      layout: layout(c, title, { margin: { l: 90, r: 20, t: 52, b: 48 }, xaxis: { title: { text: 'Occurrences' } }, showlegend: false }),
    }));
    wordChart('hamWordsChart', e.top_words.ham, 'ham', 'Most frequent words in ham');
    wordChart('spamWordsChart', e.top_words.spam, 'spam', 'Most frequent words in spam');
    $('#edaNote').textContent = `Spam messages average ${num(s.spam.avg_chars, 1)} characters against ${num(s.ham.avg_chars, 1)} for ham. Most common message lengths: `
      + e.most_common_lengths.map((m) => `${m.length} characters (${m.count} messages)`).join(', ') + '.';
  } catch (err) {
    ['classBarChart', 'classPieChart', 'lengthHistChart', 'lengthBoxChart', 'hamWordsChart', 'spamWordsChart'].forEach((id) => chartMessage(id, err.message));
  }
}

/* ---------------------------------------------------------------- TF-IDF */
async function loadTfidf() {
  try {
    const t = await api('/api/tfidf');
    const cards = [
      ['Text features', fmt(t.n_features)],
      ['Single words / two-word phrases', `${fmt(t.n_unigrams)} / ${fmt(t.n_bigrams)}`],
      ['Training matrix', `${fmt(t.train_shape[0])} × ${fmt(t.train_shape[1])}`],
      ['Test matrix', `${fmt(t.test_shape[0])} × ${fmt(t.test_shape[1])}`],
      ['Non-zero values (train)', fmt(t.nonzero_train)],
      ['Sparsity (zeros)', `${num(t.sparsity_pct, 2)}%`],
      ['Avg non-zero terms per message', num(t.avg_nonzero_per_message, 1)],
      ['Minimum document frequency', fmt(t.settings.min_df)],
    ];
    setHTML('tfidfCards', cards.map(([k, v]) => `<div class="stat"><div class="v">${v}</div><div class="k">${esc(k)}</div></div>`).join(''));
    const termChart = (id, rows, colorKey, title) => draw(id, (c) => ({
      data: [{
        type: 'bar', orientation: 'h', x: rows.map((r) => r.score).reverse(), y: rows.map((r) => r.term).reverse(),
        marker: { color: c[colorKey] }, hovertemplate: '%{y}: %{x:.4f}<extra></extra>',
      }],
      layout: layout(c, title, { margin: { l: 110, r: 20, t: 52, b: 48 }, xaxis: { title: { text: 'Mean TF-IDF weight (training set)' } }, showlegend: false }),
    }));
    termChart('tfidfSpamChart', t.top_spam_terms, 'spam', 'Highest-weighted terms in spam');
    termChart('tfidfHamChart', t.top_ham_terms, 'ham', 'Highest-weighted terms in ham');
    setHTML('vocabChips', t.sample_vocabulary.map((v) => `<span class="chip">${esc(v)}</span>`).join(''));
    setHTML('tfidfExample', `
      <p>${labelBadge(t.example.label)} <i>"${esc(t.example.message)}"</i></p>
      <div class="table-wrap"><table class="table"><thead><tr><th>Term</th><th class="num">TF-IDF weight</th></tr></thead>
      <tbody>${t.example.terms.map((x) => `<tr><td>${esc(x.term)}</td><td class="num">${num(x.weight, 4)}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted small">All other ${fmt(t.n_features - t.example.terms.length)} positions in this message's vector are zero.</p>`);
    const n = Math.max(t.lowest_idf.length, t.highest_idf.length);
    let rows = '';
    for (let i = 0; i < n; i += 1) {
      const a = t.lowest_idf[i];
      const b = t.highest_idf[i];
      rows += `<tr><td>${a ? esc(a.term) : ''}</td><td class="num">${a ? num(a.idf, 3) : ''}</td><td>${b ? esc(b.term) : ''}</td><td class="num">${b ? num(b.idf, 3) : ''}</td></tr>`;
    }
    setHTML('idfTable', `<thead><tr><th>Most common term</th><th class="num">IDF</th><th>Rarest term</th><th class="num">IDF</th></tr></thead><tbody>${rows}</tbody>`);
  } catch (err) {
    setHTML('tfidfCards', errorBox(err));
  }
}

/* ---------------------------------------------------------------- SVM */
function ensureOption(select, value) {
  const v = String(value);
  if (![...select.options].some((o) => o.value === v)) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = v;
    select.appendChild(opt);
  }
  select.value = v;
}

function setSvmControls(p) {
  if (!p) return;
  $('#svmKernel').value = p.kernel;
  $('#svmC').value = p.C;
  ensureOption($('#svmGamma'), p.gamma);
  $('#svmBalanced').checked = !!p.balanced;
  $('#svmGamma').disabled = p.kernel === 'linear';
}

function setBlrControls(p) {
  if (!p) return;
  ensureOption($('#blrPrior'), p.prior_variance);
  ensureOption($('#blrFeatures'), p.n_features);
}

function readSvmControls() {
  return {
    kernel: $('#svmKernel').value,
    C: Number($('#svmC').value),
    gamma: $('#svmGamma').value,
    balanced: $('#svmBalanced').checked,
  };
}

function renderSvm(r) {
  const p = r.params;
  const sv = r.support_vectors;
  setHTML('svmResults', `
    <p class="result-meta">Measured on the test set (${fmt(r.n_test)} messages) after training on ${fmt(r.n_train)} messages with ${fmt(r.n_features)} TF-IDF features.</p>
    ${metricStrip(r.metrics)}
    <div class="table-wrap"><table class="table"><tbody>
      <tr><th>Configuration</th><td>Kernel <b>${esc(p.kernel)}</b>, C = ${p.C}${p.kernel !== 'linear' ? `, gamma = ${esc(p.gamma)}` : ''}${p.kernel === 'poly' ? ', degree = 2, coef0 = 1' : ''}, class weights ${p.balanced ? 'balanced' : 'equal'}</td></tr>
      <tr><th>Support vectors</th><td>${fmt(sv.total)} (${fmt(sv.ham)} ham, ${fmt(sv.spam)} spam), which is ${num(r.support_vector_pct, 1)}% of the training messages</td></tr>
      <tr><th>Training time</th><td>${num(r.train_time_sec, 3)} seconds</td></tr>
      ${r.top_terms ? `<tr><th>Intercept b</th><td>${num(r.top_terms.intercept, 4)}</td></tr>` : ''}
    </tbody></table></div>`);
  updateHeroModel(r);
  if (r.top_terms) {
    const spam = r.top_terms.spam.slice(0, 10);
    const ham = r.top_terms.ham.slice(0, 10);
    const terms = [...ham.slice().reverse(), ...spam.slice().reverse()].reverse();
    draw('svmTermsChart', (c) => ({
      data: [{
        type: 'bar', orientation: 'h', x: terms.map((t) => t.weight), y: terms.map((t) => t.term),
        marker: { color: terms.map((t) => (t.weight > 0 ? c.spam : c.ham)) },
        hovertemplate: '%{y}: w = %{x:.3f}<extra></extra>',
      }],
      layout: layout(c, 'Linear SVM weights: strongest spam (+) and ham (−) terms', {
        margin: { l: 120, r: 20, t: 52, b: 48 }, xaxis: { title: { text: 'Weight w (positive pushes toward spam)' } },
        yaxis: { autorange: 'reversed' }, showlegend: false,
      }),
    }));
  } else {
    chartMessage('svmTermsChart', `Word weights exist only for the linear kernel. With the ${p.kernel.toUpperCase()} kernel the decision function is a weighted sum of kernel similarities to the ${fmt(sv.total)} support vectors, so there is no single weight per word.`);
  }
}

async function loadSvm() {
  try {
    const res = await api('/api/train-svm');
    renderSvm(res.result);
    loadBoundary();
  } catch (err) {
    setHTML('svmResults', errorBox(err));
  }
}

async function loadBoundary() {
  try {
    const b = await api('/api/svm-boundary');
    draw('svmBoundaryChart', (c) => {
      const pts = b.points;
      const pick = (lab, sv) => pts.x.map((_, i) => i).filter((i) => pts.label[i] === lab && (sv === undefined || pts.is_sv[i] === sv));
      const scatter = (idx, name, color, extra = {}) => Object.assign({
        type: 'scatter', mode: 'markers', name, x: idx.map((i) => pts.x[i]), y: idx.map((i) => pts.y[i]),
        marker: Object.assign({ color, size: 6, opacity: 0.75 }, extra.marker || {}), hoverinfo: 'name',
      }, extra.trace || {});
      const svIdx = pts.x.map((_, i) => i).filter((i) => pts.is_sv[i]);
      return {
        data: [
          {
            type: 'contour', x: b.grid_x, y: b.grid_y, z: b.z, zmin: -2, zmax: 2, showscale: false, hoverinfo: 'skip',
            colorscale: [[0, rgba(c.ham, 0.35)], [0.5, 'rgba(0,0,0,0)'], [1, rgba(c.spam, 0.35)]],
            contours: { coloring: 'heatmap' }, line: { width: 0 },
          },
          {
            type: 'contour', x: b.grid_x, y: b.grid_y, z: b.z, showscale: false, hoverinfo: 'skip', name: 'Margin f(x) = ±1',
            contours: { coloring: 'none', start: -1, end: 1, size: 2 }, line: { color: c.ink, width: 1.2, dash: 'dash' }, showlegend: true,
          },
          {
            type: 'contour', x: b.grid_x, y: b.grid_y, z: b.z, showscale: false, hoverinfo: 'skip', name: 'Decision boundary f(x) = 0',
            contours: { coloring: 'none', start: 0, end: 0, size: 1 }, line: { color: c.ink, width: 2.6 }, showlegend: true,
          },
          scatter(pick(0), 'Ham', c.ham),
          scatter(pick(1), 'Spam', c.spam),
          scatter(svIdx, 'Support vectors', c.ink, { marker: { symbol: 'circle-open', size: 10, color: c.ink, opacity: 0.9 } }),
        ],
        layout: layout(c, `Decision boundary in a 2-D projection (${b.params.kernel} kernel)`, {
          xaxis: { title: { text: 'SVD component 1 (standardised)' }, range: [b.grid_x[0], b.grid_x[b.grid_x.length - 1]] },
          yaxis: { title: { text: 'SVD component 2 (standardised)' }, range: [b.grid_y[0], b.grid_y[b.grid_y.length - 1]] },
          legend: { orientation: 'h', y: -0.28, x: 0, yanchor: 'top', font: { size: 11 } },
          margin: { l: 56, r: 20, t: 52, b: 110 },
        }),
      };
    });
    $('#svmBoundaryNote').textContent = `Visualisation only: the ${fmt(b.n_points)} plotted training messages were projected from all TF-IDF dimensions down to 2 with Truncated SVD (keeping ${num(b.explained_variance_pct, 1)}% of the variance), and a separate SVM with the same kernel and C was trained on these 2-D points (${fmt(b.n_sv_2d)} support vectors, 2-D training accuracy ${pct(b.accuracy_2d)}). Shaded regions show which side of the boundary each point falls on. The real classifier uses all features; its measured test-set results are shown above.`;
  } catch (err) {
    chartMessage('svmBoundaryChart', err.message);
  }
}

async function trainSvm() {
  const C = Number($('#svmC').value);
  if (!Number.isFinite(C) || C < 0.001 || C > 1000) {
    setHTML('svmResults', errorBox('C must be a number between 0.001 and 1000.'));
    return;
  }
  busy(true, 'Training the SVM…');
  try {
    const res = await postJSON('/api/train-svm', readSvmControls());
    renderSvm(res.result);
    toast('SVM trained');
    await Promise.allSettled([loadBoundary(), loadCompare(), loadConfusion(), loadCV(), loadFindings()]);
  } catch (err) {
    setHTML('svmResults', errorBox(err));
  } finally {
    busy(false);
  }
}

/* ---------------------------------------------------------------- kernels + tuning */
function renderKernels(res) {
    $('#kernelChart').classList.remove('hidden');
    const bestF1 = Math.max(...res.rows.map((r) => r.f1));
    setHTML('kernelResults', `
      <p class="result-meta">Trained on ${fmt(res.n_train)} messages, measured on the same ${fmt(res.n_test)} test messages.</p>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Kernel</th><th>Settings</th><th class="num">Accuracy</th><th class="num">Precision</th><th class="num">Recall</th><th class="num">F1-score</th><th class="num">ROC-AUC</th><th class="num">Support vectors</th><th class="num">Train time (s)</th></tr></thead>
        <tbody>${res.rows.map((r) => `<tr class="${r.f1 === bestF1 ? 'best' : ''}"><td><b>${esc(r.kernel)}</b></td><td>${esc(r.settings)}</td><td class="num">${pct(r.accuracy)}</td><td class="num">${pct(r.precision)}</td><td class="num">${pct(r.recall)}</td><td class="num">${pct(r.f1)}</td><td class="num">${num(r.roc_auc, 4)}</td><td class="num">${fmt(r.support_vectors)}</td><td class="num">${num(r.train_time_sec, 3)}</td></tr>`).join('')}</tbody>
      </table></div>
      <p class="muted small">Highlighted row: highest F1 measured on this particular split. Different data or settings can change the ordering.</p>`);
    draw('kernelChart', (col) => ({
      data: ['accuracy', 'precision', 'recall', 'f1'].map((m, i) => ({
        type: 'bar', name: m === 'f1' ? 'F1-score' : cap(m), x: res.rows.map((r) => r.kernel), y: res.rows.map((r) => r[m]),
        marker: { color: [col.accent, col.ham, col.warn, col.spam][i] }, hovertemplate: '%{x}: %{y:.2%}<extra></extra>',
      })),
      layout: layout(col, 'Kernel comparison on the test set', { barmode: 'group', yaxis: { tickformat: '.0%', range: [0, 1.05] } }),
    }));
}

async function loadKernels() {
  try {
    const res = await api('/api/kernel-experiment');
    if (res.available) {
      renderKernels(res);
    } else {
      setHTML('kernelResults', '<p class="muted">Run the kernel comparison to measure each kernel on the current dataset.</p>');
      chartMessage('kernelChart', '');
      $('#kernelChart').classList.add('hidden');
    }
  } catch (err) {
    setHTML('kernelResults', errorBox(err));
  }
}

async function runKernels() {
  busy(true, 'Training linear, RBF and polynomial SVMs…');
  try {
    const c = readSvmControls();
    const res = await postJSON('/api/kernel-experiment', { C: c.C, gamma: c.gamma, balanced: c.balanced });
    renderKernels(res);
    loadFindings();
  } catch (err) {
    setHTML('kernelResults', errorBox(err));
  } finally {
    busy(false);
  }
}

async function runTuning() {
  busy(true, 'Running grid search with cross-validation… this can take up to a minute');
  try {
    const res = await postJSON('/api/tune-svm', { balanced: $('#svmBalanced').checked, apply: true });
    renderTuning(res);
    if (res.result) {
      setSvmControls(res.result.params);
      renderSvm(res.result);
    }
    toast('Grid search finished');
    await Promise.allSettled([loadBoundary(), loadCompare(), loadConfusion(), loadCV(), loadFindings()]);
  } catch (err) {
    setHTML('tuneResults', errorBox(err));
  } finally {
    busy(false);
  }
}

function renderTuning(res) {
    const bp = res.best_params;
    setHTML('tuneResults', `
      <div class="alert alert-info">Selected configuration: kernel <b>${esc(bp.kernel)}</b>, C = <b>${bp.C}</b>${bp.kernel !== 'linear' ? `, gamma = <b>${esc(bp.gamma)}</b>` : ''} (mean ${res.cv_folds}-fold CV F1 ${pct(res.best_cv_f1)}, search took ${num(res.time_sec, 1)} s). ${res.applied ? 'It was applied to the main SVM and evaluated on the test set (section 9); you may have changed the SVM settings since.' : ''}</div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th class="num">Rank</th><th>Kernel</th><th class="num">C</th><th>Gamma</th><th class="num">Mean CV F1</th><th class="num">Std</th></tr></thead>
        <tbody>${res.rows.map((r) => `<tr class="${r.rank === 1 ? 'best' : ''}"><td class="num">${r.rank}</td><td>${esc(r.kernel)}</td><td class="num">${r.C}</td><td>${esc(r.gamma)}</td><td class="num">${pct(r.mean_f1)}</td><td class="num">${num(r.std_f1, 4)}</td></tr>`).join('')}</tbody>
      </table></div>`);
}

async function loadTuning() {
  try {
    const res = await api('/api/tune-svm');
    if (res.available) renderTuning(res);
    else setHTML('tuneResults', '<p class="muted">Run the grid search to tune the SVM on the current dataset.</p>');
  } catch (err) {
    setHTML('tuneResults', errorBox(err));
  }
}

/* ---------------------------------------------------------------- Bayesian logistic regression */
function gaussian(x, mu, sd) {
  return Math.exp(-0.5 * ((x - mu) / sd) ** 2) / (sd * Math.sqrt(2 * Math.PI));
}

function renderBlr(r) {
  const p = r.params;
  setHTML('blrResults', `
    <p class="result-meta">Measured on the test set using the moderated (Bayesian predictive) probability with a 0.5 threshold.</p>
    ${metricStrip(r.metrics)}
    <div class="table-wrap"><table class="table"><tbody>
      <tr><th>Prior</th><td>w ~ N(0, ${p.prior_variance} I) for the ${fmt(r.n_features_used)} selected features; intercept ~ N(0, 100)</td></tr>
      <tr><th>MAP optimisation</th><td>L-BFGS ${r.converged ? 'converged' : 'did not fully converge'} in ${fmt(r.iterations)} iterations; negative log posterior ${num(r.neg_log_posterior, 3)}; time ${num(r.train_time_sec, 3)} s</td></tr>
      <tr><th>Intercept</th><td>${num(r.bias, 3)} ± ${num(r.bias_std, 3)} (posterior mean ± std)</td></tr>
      <tr><th>Log loss on test set</th><td>MAP plug-in ${num(r.log_loss_map, 4)}, Bayesian predictive ${num(r.log_loss_bayes, 4)} (lower is better)</td></tr>
      <tr><th>ROC-AUC</th><td>MAP plug-in ${num(r.metrics_map.roc_auc, 4)}, Bayesian predictive ${num(r.metrics.roc_auc, 4)}</td></tr>
      <tr><th>Average predictive std of activation</th><td>${num(r.mean_predictive_std, 3)}</td></tr>
    </tbody></table></div>`);

  const top = r.top_terms.spam.slice(0, 3);
  draw('blrPosteriorChart', (c) => {
    const lo = Math.min(-3 * Math.sqrt(p.prior_variance) * 0.4, ...top.map((t) => t.weight - 4 * t.posterior_std));
    const hi = Math.max(...top.map((t) => t.weight + 4 * t.posterior_std), 1);
    const xs = Array.from({ length: 240 }, (_, i) => lo + (hi - lo) * i / 239);
    const colors = [c.spam, c.accent, c.warn];
    return {
      data: [
        { type: 'scatter', mode: 'lines', name: `Prior N(0, ${p.prior_variance})`, x: xs, y: xs.map((x) => gaussian(x, 0, Math.sqrt(p.prior_variance))), line: { color: c.muted, dash: 'dash', width: 2 } },
        ...top.map((t, i) => ({
          type: 'scatter', mode: 'lines', name: `Posterior for "${t.term}"`, x: xs,
          y: xs.map((x) => gaussian(x, t.weight, Math.max(t.posterior_std, 1e-6))), line: { color: colors[i], width: 2.4 },
        })),
      ],
      layout: layout(c, 'Laplace approximation: prior vs posterior of top spam weights', {
        xaxis: { title: { text: 'Weight value w' } }, yaxis: { title: { text: 'Probability density' } },
        legend: { orientation: 'h', y: -0.28, x: 0, yanchor: 'top', font: { size: 11 } }, margin: { l: 56, r: 20, t: 52, b: 110 },
      }),
    };
  });

  const terms = [...r.top_terms.spam.slice(0, 8), ...r.top_terms.ham.slice(0, 8).reverse()];
  draw('blrTermsChart', (c) => ({
    data: [{
      type: 'bar', orientation: 'h', x: terms.map((t) => t.weight), y: terms.map((t) => t.term),
      error_x: { type: 'data', array: terms.map((t) => 1.96 * t.posterior_std), color: c.ink, thickness: 1.2, width: 3 },
      marker: { color: terms.map((t) => (t.weight > 0 ? c.spam : c.ham)) },
      hovertemplate: '%{y}: %{x:.3f}<extra></extra>',
    }],
    layout: layout(c, 'MAP weights with 95% Laplace credible intervals', {
      margin: { l: 120, r: 20, t: 52, b: 48 }, yaxis: { autorange: 'reversed' },
      xaxis: { title: { text: 'Weight (positive pushes toward spam)' } }, showlegend: false,
    }),
  }));

  setHTML('blrExtra', `
    <h3>Where the Bayesian (moderated) probability differs most from the MAP probability</h3>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Test message</th><th>Actual</th><th class="num">P(spam) MAP</th><th class="num">P(spam) Bayesian</th><th class="num">Activation std</th></tr></thead>
      <tbody>${r.examples.map((e) => `<tr><td class="msg-cell">${esc(e.message)}</td><td>${labelBadge(e.actual)}</td><td class="num">${num(e.p_map, 4)}</td><td class="num">${num(e.p_bayes, 4)}</td><td class="num">${num(e.activation_std, 3)}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="muted small">A larger activation standard deviation means the model is less certain about this message, so the Bayesian probability is pulled closer to 0.5 than the MAP probability.</p>`);
}

async function loadBlr() {
  try {
    const res = await api('/api/train-bayesian-logistic');
    renderBlr(res.result);
  } catch (err) {
    setHTML('blrResults', errorBox(err));
  }
}

async function trainBlr() {
  busy(true, 'Training Bayesian logistic regression (MAP + Laplace)…');
  try {
    const res = await postJSON('/api/train-bayesian-logistic', {
      prior_variance: Number($('#blrPrior').value), n_features: Number($('#blrFeatures').value),
    });
    renderBlr(res.result);
    toast('Bayesian logistic regression trained');
    await Promise.allSettled([loadCompare(), loadConfusion(), loadCV(), loadFindings()]);
  } catch (err) {
    setHTML('blrResults', errorBox(err));
  } finally {
    busy(false);
  }
}

/* ---------------------------------------------------------------- comparison */
async function loadCompare() {
  try {
    const r = await api('/api/compare-models');
    const names = { accuracy: 'Accuracy', precision: 'Precision', recall: 'Recall', f1: 'F1-score', specificity: 'Specificity', roc_auc: 'ROC-AUC' };
    const sp = r.svm.params;
    setHTML('compareTable', `
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Metric (test set, spam = positive)</th><th class="num">SVM (${esc(sp.kernel)}, C=${sp.C})</th><th class="num">Bayesian logistic regression</th></tr></thead>
        <tbody>${r.rows.map((x) => `<tr><td>${names[x.metric]}</td><td class="num">${x.metric === 'roc_auc' ? num(x.svm, 4) : pct(x.svm)}</td><td class="num">${x.metric === 'roc_auc' ? num(x.blr, 4) : pct(x.blr)}</td></tr>`).join('')}
        <tr><td>Training time</td><td class="num">${num(r.svm.train_time_sec, 3)} s</td><td class="num">${num(r.blr.train_time_sec, 3)} s</td></tr></tbody>
      </table></div>
      <p class="muted small">Both models use the same training and test messages. Small differences on a test set of ${fmt(r.test_size)} messages may not be meaningful.</p>`);
    const keys = ['accuracy', 'precision', 'recall', 'f1', 'specificity'];
    draw('compareChart', (c) => ({
      data: [
        { type: 'bar', name: 'SVM', x: keys.map((k) => names[k]), y: keys.map((k) => r.svm.metrics[k]), marker: { color: c.accent }, hovertemplate: '%{x}: %{y:.2%}<extra>SVM</extra>' },
        { type: 'bar', name: 'Bayesian LR', x: keys.map((k) => names[k]), y: keys.map((k) => r.blr.metrics[k]), marker: { color: c.warn }, hovertemplate: '%{x}: %{y:.2%}<extra>Bayesian LR</extra>' },
      ],
      layout: layout(c, 'Observed test-set performance', { barmode: 'group', yaxis: { tickformat: '.0%', range: [0, 1.05] } }),
    }));
    if (r.svm.metrics.roc && r.blr.metrics.roc) {
      draw('rocChart', (c) => ({
        data: [
          { type: 'scatter', mode: 'lines', name: `SVM (AUC ${num(r.svm.metrics.roc_auc, 3)})`, x: r.svm.metrics.roc.fpr, y: r.svm.metrics.roc.tpr, line: { color: c.accent, width: 2.4 } },
          { type: 'scatter', mode: 'lines', name: `Bayesian LR (AUC ${num(r.blr.metrics.roc_auc, 3)})`, x: r.blr.metrics.roc.fpr, y: r.blr.metrics.roc.tpr, line: { color: c.warn, width: 2.4 } },
          { type: 'scatter', mode: 'lines', name: 'Random guess', x: [0, 1], y: [0, 1], line: { color: c.muted, dash: 'dot', width: 1 } },
        ],
        layout: layout(c, 'ROC curves', { xaxis: { title: { text: 'False positive rate' }, range: [0, 1] }, yaxis: { title: { text: 'True positive rate (recall)' }, range: [0, 1.02] } }),
      }));
    } else {
      chartMessage('rocChart', 'ROC curves need both classes in the test set.');
    }
    if (r.pr) {
      draw('prChart', (c) => ({
        data: [
          { type: 'scatter', mode: 'lines', name: `SVM (AP ${num(r.pr.svm.average_precision, 3)})`, x: r.pr.svm.recall, y: r.pr.svm.precision, line: { color: c.accent, width: 2.4 } },
          { type: 'scatter', mode: 'lines', name: `Bayesian LR (AP ${num(r.pr.blr.average_precision, 3)})`, x: r.pr.blr.recall, y: r.pr.blr.precision, line: { color: c.warn, width: 2.4 } },
        ],
        layout: layout(c, 'Precision–recall curves', { xaxis: { title: { text: 'Recall' }, range: [0, 1.02] }, yaxis: { title: { text: 'Precision' }, range: [0, 1.02] } }),
      }));
    } else {
      chartMessage('prChart', 'Precision–recall curves need both classes in the test set.');
    }
    ui.thresholds = r.thresholds || [];
    renderThreshold();
    renderGenerative(r);
    const testHam = r.test_size - r.test_spam;
    $('#imbalanceNote').innerHTML = `<b>Why accuracy alone is not enough.</b> The test set has ${fmt(testHam)} ham and ${fmt(r.test_spam)} spam messages. A model that always predicts "ham" would reach ${pct(r.majority_baseline_accuracy)} accuracy while catching no spam at all (recall 0%). Precision, recall and F1 focus on the spam class and reveal what accuracy hides.`;
  } catch (err) {
    setHTML('compareTable', errorBox(err));
  }
}

function renderThreshold() {
  const v = Number($('#thrSlider').value);
  $('#thrValue').textContent = v.toFixed(2);
  const row = ui.thresholds.find((t) => Math.abs(t.threshold - v) < 1e-6);
  if (!row) { setHTML('thrStats', ''); return; }
  setHTML('thrStats', `
    <div class="metric-strip">
      <div><div class="v">${pct(row.precision)}</div><div class="k">Precision</div></div>
      <div><div class="v">${pct(row.recall)}</div><div class="k">Recall</div></div>
      <div><div class="v">${pct(row.f1)}</div><div class="k">F1-score</div></div>
    </div>
    <p class="thr-counts">At this threshold: <b>${fmt(row.fp)}</b> genuine messages blocked (FP), <b>${fmt(row.fn)}</b> spam messages missed (FN), ${fmt(row.tp)} spam caught (TP), ${fmt(row.tn)} ham delivered (TN).</p>`);
}

function renderGenerative(r) {
  if (!r.nb) { setHTML('genTable', ''); return; }
  const rows = [
    ['Multinomial Naive Bayes', 'Generative', r.nb.metrics],
    ['Bayesian logistic regression', 'Discriminative (probabilistic)', r.blr.metrics],
    [`SVM (${r.svm.params.kernel})`, 'Discriminative (non-probabilistic)', r.svm.metrics],
  ];
  setHTML('genTable', `
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Model</th><th>Type</th><th class="num">Accuracy</th><th class="num">Precision</th><th class="num">Recall</th><th class="num">F1-score</th><th class="num">ROC-AUC</th></tr></thead>
      <tbody>${rows.map(([n, t, m]) => `<tr><td>${esc(n)}</td><td>${esc(t)}</td><td class="num">${pct(m.accuracy)}</td><td class="num">${pct(m.precision)}</td><td class="num">${pct(m.recall)}</td><td class="num">${pct(m.f1)}</td><td class="num">${num(m.roc_auc, 4)}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="muted small">All three use the same training and test messages and the same TF-IDF features. Naive Bayes learned class priors of ${pct(r.nb.class_prior.ham)} ham and ${pct(r.nb.class_prior.spam)} spam from the training set.</p>`);
}

/* ---------------------------------------------------------------- cross-validation */
function renderCV(res) {
  $('#cvChart').classList.remove('hidden');
  const names = { accuracy: 'Accuracy', precision: 'Precision', recall: 'Recall', f1: 'F1-score', roc_auc: 'ROC-AUC' };
  const cell = (s, key) => (key === 'roc_auc'
    ? `${num(s.mean, 4)} ± ${num(s.std, 4)}`
    : `${pct(s.mean)} ± ${(s.std * 100).toFixed(2)}`);
  const sp = res.svm_params;
  setHTML('cvResults', `
    <p class="result-meta">${res.k}-fold stratified cross-validation on ${fmt(res.n_messages)} unique messages (${num(res.time_sec, 1)} s). SVM: ${esc(sp.kernel)} kernel, C = ${sp.C}. Bayesian LR: prior variance ${res.blr_params.prior_variance}, ${res.blr_params.n_features} features.</p>
    <div class="table-wrap"><table class="table">
      <thead><tr><th>Metric (mean ± std across folds)</th><th class="num">SVM</th><th class="num">Bayesian logistic regression</th></tr></thead>
      <tbody>${Object.keys(names).map((k) => `<tr><td>${names[k]}</td><td class="num">${cell(res.summary.svm[k], k)}</td><td class="num">${cell(res.summary.blr[k], k)}</td></tr>`).join('')}</tbody>
    </table></div>`);
  draw('cvChart', (c) => ({
    data: [
      { type: 'bar', name: 'SVM', x: res.folds.svm.map((_, i) => `Fold ${i + 1}`), y: res.folds.svm.map((f) => f.f1), marker: { color: c.accent }, hovertemplate: '%{x}: F1 %{y:.2%}<extra>SVM</extra>' },
      { type: 'bar', name: 'Bayesian LR', x: res.folds.blr.map((_, i) => `Fold ${i + 1}`), y: res.folds.blr.map((f) => f.f1), marker: { color: c.warn }, hovertemplate: '%{x}: F1 %{y:.2%}<extra>Bayesian LR</extra>' },
    ],
    layout: layout(c, 'F1-score in each cross-validation fold', { barmode: 'group', yaxis: { tickformat: '.0%', range: [0, 1.05] } }),
  }));
}

async function loadCV() {
  try {
    const res = await api('/api/cross-validate');
    if (res.available) {
      renderCV(res);
    } else {
      setHTML('cvResults', '<p class="muted">Run cross-validation to check how stable the results are for the current settings.</p>');
      chartMessage('cvChart', '');
      $('#cvChart').classList.add('hidden');
    }
  } catch (err) {
    setHTML('cvResults', errorBox(err));
  }
}

async function runCV() {
  busy(true, 'Running 5-fold cross-validation for both models…');
  try {
    const res = await postJSON('/api/cross-validate');
    renderCV(res);
    toast('Cross-validation finished');
    loadFindings();
  } catch (err) {
    setHTML('cvResults', errorBox(err));
  } finally {
    busy(false);
  }
}

/* ---------------------------------------------------------------- confusion matrix */
function cmGrid(m) {
  const total = m.tn + m.fp + m.fn + m.tp;
  return `
    <div class="cm" role="table" aria-label="Confusion matrix">
      <div></div><div class="h">Predicted ham</div><div class="h">Predicted spam</div>
      <div class="h side">Actual ham</div>
      <div class="cell good"><div class="n">${fmt(m.tn)}</div><div class="t">True negative</div></div>
      <div class="cell bad"><div class="n">${fmt(m.fp)}</div><div class="t">False positive</div></div>
      <div class="h side">Actual spam</div>
      <div class="cell bad"><div class="n">${fmt(m.fn)}</div><div class="t">False negative</div></div>
      <div class="cell good"><div class="n">${fmt(m.tp)}</div><div class="t">True positive</div></div>
    </div>
    <p class="cm-caption">${fmt(total)} test messages: ${fmt(m.tn + m.tp)} correct, ${fmt(m.fp + m.fn)} wrong. ${fmt(m.fp)} genuine messages would be blocked and ${fmt(m.fn)} spam messages would get through.</p>`;
}

async function loadConfusion() {
  try {
    const r = await api('/api/confusion-matrix');
    setHTML('cmSvm', cmGrid(r.svm));
    setHTML('cmBlr', cmGrid(r.blr));
    const mis = r.svm_misclassified;
    const list = (items, empty) => (items.length
      ? `<ul>${items.map((x) => `<li>${esc(x.message)}<span>${esc(mis.score_name)}: ${num(x.score, 3)}</span></li>`).join('')}</ul>`
      : `<p class="muted">${empty}</p>`);
    setHTML('misclassified', `
      <div class="mis-list">
        <div><h4>False positives (ham flagged as spam)</h4>${list(mis.false_positives, 'None in the test set.')}</div>
        <div><h4>False negatives (spam that got through)</h4>${list(mis.false_negatives, 'None in the test set.')}</div>
      </div>`);
  } catch (err) {
    setHTML('cmSvm', errorBox(err));
  }
}

/* ---------------------------------------------------------------- linear regression */
async function loadLinreg() {
  try {
    const out = $('#outlierToggle').checked ? 1 : 0;
    const r = await api(`/api/linear-regression?outliers=${out}`);
    const tr = r.train_metrics;
    const te = r.test_metrics;
    setHTML('linregResults', `
      <p class="result-meta">${esc(r.task)}. Training points: ${fmt(r.n_train)}${r.synthetic_outliers ? ` (including ${r.synthetic_outliers} synthetic outliers)` : ''}; test points: ${fmt(r.n_test)}.</p>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Method</th><th class="num">Intercept w₀</th><th class="num">Slope w₁</th><th class="num">Test MAE</th><th class="num">Test RMSE</th><th class="num">Test R²</th></tr></thead>
        <tbody>
          <tr><td>Least squares, normal equations (NumPy)</td><td class="num">${num(r.normal_equation.intercept, 4)}</td><td class="num">${num(r.normal_equation.slope, 4)}</td><td class="num">${num(te.mae, 3)}</td><td class="num">${num(te.rmse, 3)}</td><td class="num">${num(te.r2, 4)}</td></tr>
          <tr><td>scikit-learn LinearRegression</td><td class="num">${num(r.sklearn.intercept, 4)}</td><td class="num">${num(r.sklearn.slope, 4)}</td><td class="num">${num(te.mae, 3)}</td><td class="num">${num(te.rmse, 3)}</td><td class="num">${num(te.r2, 4)}</td></tr>
          <tr><td>Robust: Huber regression</td><td class="num">${num(r.huber.intercept, 4)}</td><td class="num">${num(r.huber.slope, 4)}</td><td class="num">${num(r.huber.test.mae, 3)}</td><td class="num">${num(r.huber.test.rmse, 3)}</td><td class="num">${num(r.huber.test.r2, 4)}</td></tr>
        </tbody>
      </table></div>
      <div class="metric-strip">
        <div><div class="v">${num(tr.mae, 2)} / ${num(te.mae, 2)}</div><div class="k">MAE train / test</div></div>
        <div><div class="v">${num(tr.rmse, 2)} / ${num(te.rmse, 2)}</div><div class="k">RMSE train / test</div></div>
        <div><div class="v">${num(tr.r2, 3)} / ${num(te.r2, 3)}</div><div class="k">R² train / test</div></div>
        <div><div class="v">${num(r.sigma_ml, 2)}</div><div class="k">σ<sub>ML</sub> (noise std, ML estimate)</div></div>
      </div>
      <p class="muted small">Model: predicted length = ${num(r.sklearn.intercept, 2)} + ${num(r.sklearn.slope, 2)} × word count. The normal-equation and scikit-learn coefficients match, confirming that LinearRegression solves the least-squares (maximum-likelihood) problem. Huber flagged ${fmt(r.huber.n_outliers_flagged)} training points as outliers.</p>`);
    draw('linregChart', (c) => {
      const s = r.scatter_train;
      const normal = s.x.map((_, i) => i).filter((i) => !s.is_outlier[i]);
      const outl = s.x.map((_, i) => i).filter((i) => s.is_outlier[i]);
      const data = [
        { type: 'scatter', mode: 'markers', name: 'Training data', x: normal.map((i) => s.x[i]), y: normal.map((i) => s.y[i]), marker: { color: rgba(c.muted, 0.45), size: 5 } },
        { type: 'scatter', mode: 'markers', name: 'Test data', x: r.scatter_test.x, y: r.scatter_test.y, marker: { color: rgba(c.accent, 0.7), size: 6 } },
        { type: 'scatter', mode: 'lines', name: 'Least squares', x: r.line_x, y: r.line_ols, line: { color: c.accent, width: 3 } },
        { type: 'scatter', mode: 'lines', name: 'Huber (robust)', x: r.line_x, y: r.line_huber, line: { color: c.ham, width: 3, dash: 'dash' } },
      ];
      if (outl.length) data.splice(1, 0, { type: 'scatter', mode: 'markers', name: 'Synthetic outliers', x: outl.map((i) => s.x[i]), y: outl.map((i) => s.y[i]), marker: { color: c.spam, size: 9, symbol: 'x' } });
      return { data, layout: layout(c, 'Word count vs character length', { xaxis: { title: { text: 'Word count' } }, yaxis: { title: { text: 'Characters' } } }) };
    });
    draw('linregAvpChart', (c) => {
      const a = r.actual_vs_pred;
      const mx = Math.max(...a.actual, ...a.predicted);
      return {
        data: [
          { type: 'scatter', mode: 'markers', name: 'Test messages', x: a.actual, y: a.predicted, marker: { color: rgba(c.accent, 0.65), size: 6 } },
          { type: 'scatter', mode: 'lines', name: 'Perfect prediction', x: [0, mx], y: [0, mx], line: { color: c.muted, dash: 'dot' } },
        ],
        layout: layout(c, 'Actual vs predicted length (test set)', { xaxis: { title: { text: 'Actual characters' } }, yaxis: { title: { text: 'Predicted characters' } } }),
      };
    });
    setHTML('linregTrainTable', `<thead><tr><th>Message (start)</th><th class="num">Word count (x)</th><th class="num">Character length (t)</th></tr></thead>
      <tbody>${r.train_table.map((t) => `<tr><td class="msg-cell">${esc(t.message)}</td><td class="num">${t.word_count}</td><td class="num">${t.char_length}</td></tr>`).join('')}</tbody>`);
    setHTML('linregTable', `<thead><tr><th>Message (start)</th><th class="num">Words</th><th class="num">Actual length</th><th class="num">Predicted</th><th class="num">Error</th></tr></thead>
      <tbody>${r.table.map((t) => `<tr><td class="msg-cell">${esc(t.message)}</td><td class="num">${t.word_count}</td><td class="num">${t.actual}</td><td class="num">${num(t.predicted, 1)}</td><td class="num">${num(t.error, 1)}</td></tr>`).join('')}</tbody>`);
  } catch (err) {
    setHTML('linregResults', errorBox(err));
  }
}

async function loadPoly() {
  try {
    ui.poly = await api('/api/polynomial');
    drawPoly();
  } catch (err) {
    chartMessage('polyCurveChart', err.message);
    chartMessage('polyErrorChart', err.message);
  }
}

function drawPoly() {
  const r = ui.poly;
  if (!r) return;
  const d = $('#polyDegree').value;
  $('#polyDegreeVal').textContent = d;
  const row = r.rows[Number(d) - 1];
  draw('polyCurveChart', (c) => ({
    data: [
      { type: 'scatter', mode: 'markers', name: 'Training data', x: r.train_points.x, y: r.train_points.y, marker: { color: rgba(c.muted, 0.45), size: 5 } },
      { type: 'scatter', mode: 'lines', name: `Degree ${d} fit`, x: r.grid_x, y: r.curves[d], line: { color: c.accent, width: 3 } },
    ],
    layout: layout(c, `Polynomial regression, degree ${d} (test RMSE ${num(row.test_rmse, 2)})`, { xaxis: { title: { text: 'Word count' } }, yaxis: { title: { text: 'Characters' } } }),
  }));
  draw('polyErrorChart', (c) => ({
    data: [
      { type: 'scatter', mode: 'lines+markers', name: 'Training RMSE', x: r.rows.map((x) => x.degree), y: r.rows.map((x) => x.train_rmse), line: { color: c.muted } },
      { type: 'scatter', mode: 'lines+markers', name: 'Test RMSE', x: r.rows.map((x) => x.degree), y: r.rows.map((x) => x.test_rmse), line: { color: c.spam } },
    ],
    layout: layout(c, 'Error vs polynomial degree', { xaxis: { title: { text: 'Degree M' }, dtick: 1 }, yaxis: { title: { text: 'RMSE (characters)' } } }),
  }));
  $('#polyNote').textContent = `Measured: the lowest test RMSE was at degree ${r.best_degree_by_test_rmse}. Training error can only fall as the degree increases, but test error stops improving once the model starts fitting noise.`;
}

/* ---------------------------------------------------------------- ridge */
async function loadRidge() {
  try {
    const alpha = $('#ridgeAlpha').value;
    const r = await api(`/api/ridge?alpha=${encodeURIComponent(alpha)}`);
    const pretty = (f) => f.replace(/_/g, ' ');
    setHTML('ridgeResults', `
      <p class="result-meta">${esc(r.task)}. Training: ${fmt(r.n_train)}, test: ${fmt(r.n_test)} messages.</p>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Feature (standardised)</th><th class="num">OLS coefficient</th><th class="num">Ridge coefficient (λ = ${r.alpha})</th><th class="num">Bayesian ridge mean</th></tr></thead>
        <tbody>${r.features.map((f, i) => `<tr><td>${esc(pretty(f))}</td><td class="num">${num(r.ols.coef[i], 3)}</td><td class="num">${num(r.ridge.coef[i], 3)}</td><td class="num">${num(r.bayesian.coef[i], 3)}</td></tr>`).join('')}
          <tr><td>Intercept</td><td class="num">${num(r.ols.intercept, 3)}</td><td class="num">${num(r.ridge.intercept, 3)}</td><td class="num">${num(r.bayesian.intercept, 3)}</td></tr>
          <tr><td><b>‖w‖ (coefficient size)</b></td><td class="num">${num(r.ols.coef_norm, 3)}</td><td class="num">${num(r.ridge.coef_norm, 3)}</td><td class="num">–</td></tr>
          <tr><td><b>Test RMSE</b></td><td class="num">${num(r.ols.test.rmse, 3)}</td><td class="num">${num(r.ridge.test.rmse, 3)}</td><td class="num">${num(r.bayesian.test.rmse, 3)}</td></tr>
          <tr><td><b>Test R²</b></td><td class="num">${num(r.ols.test.r2, 4)}</td><td class="num">${num(r.ridge.test.r2, 4)}</td><td class="num">${num(r.bayesian.test.r2, 4)}</td></tr>
        </tbody>
      </table></div>
      <p class="muted small">Effect of regularisation: with λ = ${r.alpha} the coefficient vector size changed from ${num(r.ols.coef_norm, 2)} (OLS) to ${num(r.ridge.coef_norm, 2)} (ridge).</p>`);
    draw('ridgePathChart', (c) => {
      const cols = [c.accent, c.spam, c.ham, c.warn, c.muted];
      return {
        data: r.features.map((f, j) => ({
          type: 'scatter', mode: 'lines', name: pretty(f), x: r.path.alphas, y: r.path.coefs.map((row) => row[j]), line: { color: cols[j % cols.length], width: 2.2 },
        })),
        layout: layout(c, 'Ridge regularisation path', {
          xaxis: { type: 'log', title: { text: 'λ (log scale)' } }, yaxis: { title: { text: 'Coefficient' } },
          shapes: [{ type: 'line', x0: r.alpha, x1: r.alpha, yref: 'paper', y0: 0, y1: 1, line: { color: c.ink, dash: 'dot', width: 1 } }],
          legend: { orientation: 'h', y: -0.28, x: 0, yanchor: 'top', font: { size: 11 } }, margin: { l: 56, r: 20, t: 52, b: 110 },
        }),
      };
    });
    draw('ridgeErrorChart', (c) => ({
      data: [{ type: 'scatter', mode: 'lines+markers', name: 'Test RMSE', x: r.path.alphas, y: r.path.test_rmse, line: { color: c.spam } }],
      layout: layout(c, 'Test error vs λ', {
        xaxis: { type: 'log', title: { text: 'λ (log scale)' } }, yaxis: { title: { text: 'Test RMSE (characters)' } }, showlegend: false,
        shapes: [{ type: 'line', x0: r.alpha, x1: r.alpha, yref: 'paper', y0: 0, y1: 1, line: { color: c.ink, dash: 'dot', width: 1 } }],
      }),
    }));
    const b = r.bayesian;
    setHTML('bayesRidgeResults', `
      <h3>Bayesian linear regression: predictions with uncertainty</h3>
      <p>Estimated noise precision α = ${num(b.noise_precision_alpha, 5)} (noise std ≈ ${num(1 / Math.sqrt(b.noise_precision_alpha), 2)} characters) and weight precision λ = ${num(b.weight_precision_lambda, 5)}. Average predictive standard deviation on the test set: ${num(b.mean_predictive_std, 2)} characters.</p>
      <div class="table-wrap"><table class="table">
        <thead><tr><th class="num">Actual length</th><th class="num">Predictive mean</th><th class="num">Predictive std</th><th>95% interval</th></tr></thead>
        <tbody>${b.examples.map((e) => `<tr><td class="num">${e.actual}</td><td class="num">${num(e.mean, 1)}</td><td class="num">${num(e.std, 2)}</td><td>${num(e.mean - 1.96 * e.std, 1)} to ${num(e.mean + 1.96 * e.std, 1)}</td></tr>`).join('')}</tbody>
      </table></div>`);
  } catch (err) {
    setHTML('ridgeResults', errorBox(err));
  }
}

/* ---------------------------------------------------------------- live tester */
async function classify() {
  const message = $('#smsInput').value.trim();
  const box = $('#predictResult');
  if (!message) {
    box.innerHTML = errorBox('Type an SMS message to classify.');
    return;
  }
  box.innerHTML = '<p class="inline-loading">Classifying…</p>';
  try {
    const r = await api('/api/predict', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message }),
    });
    const s = r.svm;
    const b = r.blr;
    const maxC = s.contributions && s.contributions.length ? Math.max(...s.contributions.map((x) => Math.abs(x.contribution))) || 1 : 1;
    box.innerHTML = `
      <div class="verdicts">
        <div class="verdict ${s.label}">
          <div class="model">Support Vector Machine (${esc(s.kernel)} kernel)</div>
          <div class="label">${s.label.toUpperCase()}</div>
          <div class="detail">Decision score f(x) = ${num(s.decision_score, 4)}</div>
        </div>
        <div class="verdict ${b.label}">
          <div class="model">Bayesian logistic regression</div>
          <div class="label">${b.label.toUpperCase()}</div>
          <div class="detail">P(spam) = ${num(b.p_spam_bayes, 4)}</div>
          <div class="prob-bar"><div style="width:${(b.p_spam_bayes * 100).toFixed(1)}%"></div></div>
        </div>
      </div>
      <p class="small"><b>SVM:</b> the score is the signed distance-like value wᵀx + b (or the kernel sum). It is ${s.decision_score >= 0 ? 'positive, so the message lies on the spam side' : 'negative, so the message lies on the ham side'} of the boundary; values beyond ±1 are outside the margin.</p>
      <p class="small"><b>Bayesian LR:</b> MAP probability ${num(b.p_spam_map, 4)}; after accounting for weight uncertainty (activation ${num(b.activation_mean, 3)} ± ${num(b.activation_std, 3)}) the predictive probability is ${num(b.p_spam_bayes, 4)}.</p>
      ${s.contributions && s.contributions.length ? `
        <h4>Words that pushed the linear SVM decision</h4>
        <ul class="contrib">${s.contributions.map((x) => `<li><span>${esc(x.term)}</span><span><span class="bar ${x.contribution >= 0 ? 'pos' : 'neg'}" style="display:block;width:${(Math.abs(x.contribution) / maxC * 100).toFixed(0)}%"></span></span><span class="val">${x.contribution >= 0 ? '+' : ''}${num(x.contribution, 3)}</span></li>`).join('')}</ul>
        <p class="muted small">Red pushes toward spam, teal toward ham (weight × TF-IDF value).</p>` : ''}
      <p class="small"><b>Cleaned text:</b> <code>${esc(r.cleaned || '(empty)')}</code></p>
      ${r.n_known_terms === 0
        ? '<div class="alert alert-info">None of these words appear in the training vocabulary, so the prediction is based only on the intercept (the model\'s default leaning).</div>'
        : `<p class="muted small">${r.n_known_terms} vocabulary terms recognised: ${r.known_terms.map(esc).join(', ')}</p>`}`;
    ui.history.unshift({
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      message: r.message, svm: s.label, score: s.decision_score, blr: b.label, p: b.p_spam_bayes,
    });
    ui.history = ui.history.slice(0, 10);
    renderHistory();
  } catch (err) {
    box.innerHTML = errorBox(err);
  }
}

function renderHistory() {
  const wrap = $('#historyWrap');
  if (!wrap) return;
  if (!ui.history.length) {
    wrap.innerHTML = '<p class="muted">Messages you classify appear here, newest first.</p>';
    return;
  }
  wrap.innerHTML = `<div class="table-wrap"><table class="table">
    <thead><tr><th>Time</th><th>Message</th><th>SVM</th><th class="num">SVM score</th><th>Bayesian LR</th><th class="num">P(spam)</th></tr></thead>
    <tbody>${ui.history.map((h) => `<tr><td>${esc(h.time)}</td><td class="msg-cell">${esc(h.message.length > 90 ? `${h.message.slice(0, 90)}…` : h.message)}</td><td>${labelBadge(h.svm)}</td><td class="num">${num(h.score, 3)}</td><td>${labelBadge(h.blr)}</td><td class="num">${num(h.p, 4)}</td></tr>`).join('')}</tbody>
  </table></div>`;
}

/* ---------------------------------------------------------------- findings */
async function loadFindings() {
  try {
    const r = await api('/api/findings');
    setHTML('findingsList', r.findings.map((f) => `<li>${esc(f)}</li>`).join(''));
  } catch (err) {
    setHTML('findingsList', `<li>${esc(err.message)}</li>`);
  }
}

/* ---------------------------------------------------------------- navigation + theme */
function initNav() {
  const links = $$('.nav-list a');
  const map = new Map(links.map((a) => [a.getAttribute('href').slice(1), a]));
  if (!('IntersectionObserver' in window)) return;
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) {
        links.forEach((l) => l.classList.remove('active'));
        const a = map.get(en.target.id);
        if (a) {
          a.classList.add('active');
          if (window.innerWidth <= 900) a.scrollIntoView({ block: 'nearest', inline: 'center' });
        }
      }
    });
  }, { rootMargin: '-35% 0px -60% 0px' });
  $$('.section').forEach((s) => obs.observe(s));
}

function initTheme() {
  const btn = $('#themeToggle');
  const apply = (theme) => {
    document.documentElement.setAttribute('data-theme', theme);
    btn.textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
    btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
  };
  let saved = 'light';
  try { saved = localStorage.getItem('sms-theme') || 'light'; } catch (e) { /* storage unavailable */ }
  apply(saved);
  btn.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    apply(next);
    try { localStorage.setItem('sms-theme', next); } catch (e) { /* ignore */ }
    redrawAll();
  });
}

/* ---------------------------------------------------------------- boot */
async function refreshAll() {
  $('#globalError').classList.add('hidden');
  try {
    const s = await loadStatus();
    if (!s.loaded) {
      $('#globalError').textContent = 'No dataset is loaded. Upload the Kaggle CSV or click "Reset to sample dataset".';
      $('#globalError').classList.remove('hidden');
      return;
    }
  } catch (err) {
    $('#globalError').textContent = err.message;
    $('#globalError').classList.remove('hidden');
    return;
  }
  ui.previewPage = 1;
  await Promise.allSettled([
    loadOverview(), loadPreview(), loadPreprocess(), loadEDA(), loadTfidf(), loadSvm(), loadBlr(),
    loadCompare(), loadConfusion(), loadLinreg(), loadPoly(), loadRidge(), loadFindings(),
    loadKernels(), loadTuning(), loadCV(),
  ]);
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initNav();
  initUpload();
  initPreview();
  clearExperimentPanels();

  $('#svmKernel').addEventListener('change', (e) => { $('#svmGamma').disabled = e.target.value === 'linear'; });
  $('#trainSvmBtn').addEventListener('click', trainSvm);
  $('#kernelBtn').addEventListener('click', runKernels);
  $('#tuneBtn').addEventListener('click', runTuning);
  $('#trainBlrBtn').addEventListener('click', trainBlr);
  $('#outlierToggle').addEventListener('change', loadLinreg);
  $('#polyDegree').addEventListener('input', drawPoly);
  $('#ridgeAlpha').addEventListener('change', loadRidge);
  $('#classifyBtn').addEventListener('click', classify);
  $('#cvBtn').addEventListener('click', runCV);
  $('#thrSlider').addEventListener('input', renderThreshold);
  $('#clearHistoryBtn').addEventListener('click', () => { ui.history = []; renderHistory(); });
  $('#smsInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) classify(); });
  $$('.chip-btn').forEach((b) => b.addEventListener('click', () => { $('#smsInput').value = b.dataset.example; $('#smsInput').focus(); }));

  refreshAll();
});
