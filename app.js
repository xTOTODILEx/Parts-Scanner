(function () {
  'use strict';

  const STORE_KEY = 'partsScanner.entries.v1';
  const $ = (id) => document.getElementById(id);

  // ---------- Storage ----------
  // Each entry: { job: '12345678', aisle: 'B12-E', added: ISO date }
  let entries = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(entries));
    } catch (e) {
      toast('Could not save on this phone: ' + e.message);
    }
    updateCount();
  }

  // Adds pairs, skipping exact job+aisle duplicates. Returns how many were new.
  function addEntries(pairs) {
    const have = new Set(entries.map((e) => e.job + '|' + e.aisle));
    const now = new Date().toISOString();
    let added = 0;
    pairs.forEach((p) => {
      const job = Parser.normalizeJob(p.job);
      const aisle = Parser.normalizeAisle(p.aisle);
      if (!job || !aisle) return;
      const k = job + '|' + aisle;
      if (have.has(k)) return;
      have.add(k);
      entries.push({ job, aisle, added: p.added || now });
      added++;
    });
    if (added) persist();
    return added;
  }

  function updateCount() {
    const jobs = new Set(entries.map((e) => e.job)).size;
    $('count').textContent = jobs + ' job' + (jobs === 1 ? '' : 's');
  }

  // Ask the browser not to clear our data when space is low.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  // ---------- Helpers ----------
  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3000);
  }

  function el(tag, attrs, ...children) {
    const n = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    });
    children.flat().forEach((c) => { if (c != null) n.append(c.nodeType ? c : String(c)); });
    return n;
  }

  function fmtDate(iso) {
    try { return new Date(iso).toLocaleDateString(); } catch (e) { return ''; }
  }

  // ---------- Tabs ----------
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  function showTab(name) {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.panel').forEach((p) => { p.hidden = p.id !== 'tab-' + name; });
    if (name === 'data') renderEntries();
    if (name === 'find') $('find-input').focus();
  }

  // ---------- 1. Find ----------
  $('find-form').addEventListener('submit', (e) => { e.preventDefault(); find(); });
  $('find-input').addEventListener('input', () => { if ($('find-input').value.trim() === '') $('find-result').replaceChildren(); });

  function find() {
    const q = Parser.normalizeJob($('find-input').value);
    const out = $('find-result');
    out.replaceChildren();
    if (!q) return;

    const exact = entries.filter((e) => e.job === q);
    if (exact.length) {
      out.append(resultCard(q, exact));
      return;
    }
    out.append(el('div', { class: 'card' }, el('div', { class: 'none' }, 'Job ' + q + ' not found.')));

    if (q.length >= 3) {
      const byJob = groupByJob(entries.filter((e) => e.job.includes(q)));
      const jobs = Object.keys(byJob).slice(0, 20);
      if (jobs.length) {
        out.append(el('h2', {}, 'Similar job numbers'));
        jobs.forEach((j) => out.append(resultCard(j, byJob[j])));
      }
    }
  }

  function groupByJob(list) {
    const g = {};
    list.forEach((e) => { (g[e.job] = g[e.job] || []).push(e); });
    return g;
  }

  function resultCard(job, list) {
    const aisles = [...new Set(list.map((e) => e.aisle))].sort();
    return el('div', { class: 'card' },
      el('div', { class: 'result-job' }, 'JOB: ' + job),
      el('div', { class: 'aisles' }, aisles.map((a) => el('span', { class: 'aisle-badge' }, a))),
      aisles.length > 1 ? el('div', { class: 'note' }, '⚠️ This job is in ' + aisles.length + ' aisles') : null);
  }

  // ---------- 2. Scan ----------
  let worker = null;
  let review = []; // { job, aisle, on, guessed }

  async function getWorker() {
    if (worker) return worker;
    status('Loading text reader (first time needs internet)…');
    worker = await Tesseract.createWorker('eng', 1, Object.assign({
      logger: (m) => {
        if (m.status === 'recognizing text') status('Reading text… ' + Math.round(m.progress * 100) + '%');
      },
    }, window.OCR_OPTIONS)); // OCR_OPTIONS lets tests point at local copies of the OCR files.
    return worker;
  }

  function status(msg) {
    const s = $('scan-status');
    s.hidden = !msg;
    s.textContent = msg || '';
  }

  $('camera-input').addEventListener('change', onFiles);
  $('gallery-input').addEventListener('change', onFiles);

  async function onFiles(e) {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    if (typeof Tesseract === 'undefined') {
      toast('Text reader did not load. Connect to the internet and reload.');
      return;
    }
    try {
      const w = await getWorker();
      for (let i = 0; i < files.length; i++) {
        status('Photo ' + (i + 1) + ' of ' + files.length + ': preparing…');
        await scanFile(w, files[i], i + 1, files.length);
      }
      status('');
    } catch (err) {
      console.error(err);
      status('Something went wrong: ' + (err && err.message ? err.message : err));
    }
  }

  async function scanFile(w, file, n, total) {
    const canvas = await prepareImage(file);
    status('Photo ' + n + ' of ' + total + ': reading text…');
    // Auto layout first; if no job numbers are found, retry treating the photo as scattered labels.
    await w.setParameters({ tessedit_pageseg_mode: '3' });
    let { data } = await w.recognize(canvas);
    let result = Parser.parseOcr(data, $('fallback-aisle').value);
    if (!result.jobs.length) {
      status('Photo ' + n + ' of ' + total + ': trying again…');
      await w.setParameters({ tessedit_pageseg_mode: '11' });
      ({ data } = await w.recognize(canvas));
      result = Parser.parseOcr(data, $('fallback-aisle').value);
    }
    drawPreview(canvas, result, file.name || 'Photo ' + n);
    result.pairs.forEach((p) => review.push({ job: p.job, aisle: p.aisle, on: true, guessed: p.guessed }));
    if (!result.pairs.length) toast('No job numbers found in photo ' + n + '. Try a closer, sharper photo.');
    renderReview();
  }

  // Shrink large photos and boost contrast; this makes OCR faster and more accurate.
  async function prepareImage(file) {
    const img = await loadImage(file);
    const MAX = 2400;
    const scale = Math.min(1, MAX / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const px = d.data;
    let min = 255;
    let max = 0;
    for (let i = 0; i < px.length; i += 4) {
      const g = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      px[i] = g;
      if (g < min) min = g;
      if (g > max) max = g;
    }
    const range = Math.max(1, max - min);
    for (let i = 0; i < px.length; i += 4) {
      const v = ((px[i] - min) * 255) / range;
      px[i] = px[i + 1] = px[i + 2] = v;
    }
    ctx.putImageData(d, 0, 0);
    return c;
  }

  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not open that image')); };
      img.src = url;
    });
  }

  // Show the photo with found aisles (blue) and jobs (green) boxed, and a line joining each pair.
  function drawPreview(src, result, name) {
    const c = document.createElement('canvas');
    const scale = Math.min(1, 1200 / src.width);
    c.width = Math.round(src.width * scale);
    c.height = Math.round(src.height * scale);
    const ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0, c.width, c.height);
    const aisleColor = '#1f6feb';
    const jobColor = '#1a7f37';
    ctx.lineWidth = Math.max(2, c.width / 300);
    const box = (b, color) => {
      ctx.strokeStyle = color;
      ctx.strokeRect(b.x0 * scale, b.y0 * scale, (b.x1 - b.x0) * scale, (b.y1 - b.y0) * scale);
    };
    result.aisles.forEach((a) => box(a.bbox, aisleColor));
    result.pairs.forEach((p) => {
      box(p.jobBox, jobColor);
      if (p.aisleBox) {
        ctx.strokeStyle = 'rgba(255,140,0,.9)';
        ctx.beginPath();
        ctx.moveTo(((p.aisleBox.x0 + p.aisleBox.x1) / 2) * scale, p.aisleBox.y1 * scale);
        ctx.lineTo(((p.jobBox.x0 + p.jobBox.x1) / 2) * scale, p.jobBox.y0 * scale);
        ctx.stroke();
      }
    });
    const cap = result.aisles.length + ' aisle label(s), ' + result.pairs.length + ' job(s) found — ' + name;
    $('previews').prepend(el('div', { class: 'preview' }, c, el('div', { class: 'cap' }, cap)));
  }

  function renderReview() {
    const body = $('review-body');
    body.replaceChildren();
    review.forEach((r, i) => {
      const validAisle = Parser.isValidAisle(Parser.normalizeAisle(r.aisle));
      const validJob = Parser.isValidJob(Parser.normalizeJob(r.job));
      const aisleInput = el('input', {
        type: 'text', value: r.aisle, placeholder: 'B12-E', autocapitalize: 'characters',
        class: validAisle ? '' : 'invalid',
        oninput: (e) => { r.aisle = e.target.value; },
        onchange: renderReview,
      });
      const jobInput = el('input', {
        type: 'text', value: r.job, inputmode: 'numeric', placeholder: '12345678',
        class: validJob ? '' : 'invalid',
        oninput: (e) => { r.job = e.target.value; },
        onchange: renderReview,
      });
      body.append(el('tr', { class: (r.on ? '' : 'off ') + (validAisle && validJob ? '' : 'bad') },
        el('td', {}, el('input', { type: 'checkbox', checked: r.on, onchange: (e) => { r.on = e.target.checked; renderReview(); } })),
        el('td', {}, aisleInput, r.guessed ? el('span', { class: 'flag' }, 'no label found') : null),
        el('td', {}, jobInput),
        el('td', {}, el('button', { type: 'button', class: 'x', 'aria-label': 'Remove row', onclick: () => { review.splice(i, 1); renderReview(); } }, '✕'))));
    });
    $('review').hidden = review.length === 0;
    const n = review.filter((r) => r.on).length;
    $('save-review').textContent = 'Save ' + n + ' entr' + (n === 1 ? 'y' : 'ies');
    $('save-review').disabled = n === 0;
  }

  $('add-row').addEventListener('click', () => {
    const last = review[review.length - 1];
    review.push({ job: '', aisle: last ? last.aisle : $('fallback-aisle').value, on: true });
    renderReview();
    const inputs = $('review-body').querySelectorAll('tr:last-child input[type=text]');
    if (inputs[1]) inputs[1].focus();
  });

  $('clear-review').addEventListener('click', () => {
    if (review.length && !confirm('Discard these results?')) return;
    review = [];
    $('previews').replaceChildren();
    renderReview();
  });

  $('save-review').addEventListener('click', () => {
    const chosen = review.filter((r) => r.on);
    const bad = chosen.filter((r) => !Parser.isValidJob(Parser.normalizeJob(r.job)) || !Parser.normalizeAisle(r.aisle));
    if (bad.length && !confirm(bad.length + ' row(s) do not look like "B12-E" / 8-digit job numbers. Save anyway?')) return;
    const added = addEntries(chosen);
    toast('Saved ' + added + ' new entr' + (added === 1 ? 'y' : 'ies') + (chosen.length - added ? ' (' + (chosen.length - added) + ' already saved)' : ''));
    review = [];
    $('previews').replaceChildren();
    renderReview();
  });

  $('manual-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const aisle = Parser.normalizeAisle($('manual-aisle').value);
    const job = Parser.normalizeJob($('manual-job').value);
    if (!aisle || !job) { toast('Enter both an aisle and a job number'); return; }
    const added = addEntries([{ job, aisle }]);
    toast(added ? 'Added ' + job + ' → ' + aisle : 'Already saved');
    $('manual-job').value = '';
    $('manual-job').focus();
  });

  // ---------- 3. Excel / data ----------
  $('export-btn').addEventListener('click', () => {
    if (typeof XLSX === 'undefined') { toast('Excel library did not load. Connect to the internet and reload.'); return; }
    const sorted = [...entries].sort((a, b) => a.job.localeCompare(b.job) || a.aisle.localeCompare(b.aisle));
    const rows = sorted.map((e) => ({ 'Job Number': e.job, 'Aisle': e.aisle, 'Date Added': fmtDate(e.added) }));
    const byJob = groupByJob(sorted);
    const lookup = Object.keys(byJob).map((j) => {
      const aisles = [...new Set(byJob[j].map((e) => e.aisle))];
      return { 'Job Number': j, 'Aisles': aisles.join(', '), 'Aisle Count': aisles.length };
    });
    const wb = XLSX.utils.book_new();
    const s1 = XLSX.utils.json_to_sheet(rows, { header: ['Job Number', 'Aisle', 'Date Added'] });
    s1['!cols'] = [{ wch: 14 }, { wch: 10 }, { wch: 14 }];
    const s2 = XLSX.utils.json_to_sheet(lookup, { header: ['Job Number', 'Aisles', 'Aisle Count'] });
    s2['!cols'] = [{ wch: 14 }, { wch: 24 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, s1, 'Jobs');
    XLSX.utils.book_append_sheet(wb, s2, 'Lookup');
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, 'job-aisles-' + stamp + '.xlsx');
  });

  $('import-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (typeof XLSX === 'undefined') { toast('Excel library did not load. Connect to the internet and reload.'); return; }
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const pairs = [];
      // Read every sheet that has a "Job" column and an "Aisle" column.
      wb.SheetNames.forEach((name) => {
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: false });
        rows.forEach((row) => {
          const keys = Object.keys(row);
          const jk = keys.find((k) => /job/i.test(k));
          const ak = keys.find((k) => /aisle/i.test(k) && !/count/i.test(k));
          if (!jk || !ak) return;
          String(row[ak]).split(/[,;/]+/).map((s) => s.trim()).filter(Boolean)
            .forEach((aisle) => pairs.push({ job: String(row[jk]), aisle }));
        });
      });
      if (!pairs.length) { toast('No "Job Number" and "Aisle" columns found in that file'); return; }
      const added = addEntries(pairs);
      toast('Imported ' + added + ' new entr' + (added === 1 ? 'y' : 'ies'));
      renderEntries();
    } catch (err) {
      toast('Could not read that file: ' + err.message);
    }
  });

  $('filter-input').addEventListener('input', renderEntries);

  function renderEntries() {
    const q = $('filter-input').value.trim().toUpperCase();
    const list = entries
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => !q || e.job.includes(q) || e.aisle.includes(q))
      .sort((a, b) => b.e.added.localeCompare(a.e.added));
    const box = $('entries');
    box.replaceChildren();
    if (!list.length) {
      box.append(el('p', { class: 'muted' }, entries.length ? 'No matches.' : 'No entries yet. Add aisle photos to get started.'));
      return;
    }
    const shown = list.slice(0, 300);
    shown.forEach(({ e, i }) => {
      box.append(el('div', { class: 'entry' },
        el('div', {}, el('b', {}, e.job), ' → ', el('span', { class: 'a' }, e.aisle), el('small', {}, fmtDate(e.added))),
        el('button', { class: 'x', 'aria-label': 'Delete', onclick: () => {
          if (!confirm('Delete ' + e.job + ' in ' + e.aisle + '?')) return;
          entries.splice(i, 1);
          persist();
          renderEntries();
        } }, '🗑')));
    });
    if (list.length > shown.length) box.append(el('p', { class: 'muted' }, 'Showing ' + shown.length + ' of ' + list.length + '. Use the filter to narrow down.'));
  }

  $('clear-all').addEventListener('click', () => {
    if (!entries.length) return;
    if (!confirm('Delete ALL ' + entries.length + ' entries from this phone? Export to Excel first if you want a backup.')) return;
    entries = [];
    persist();
    renderEntries();
  });

  // ---------- Start ----------
  updateCount();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
