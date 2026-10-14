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
  let review = []; // { job, aisle, on, guessed, unclear }

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

  // ---------- Barcode reader ----------
  const BARCODE_OPTIONS = { formats: ['AllLinear', 'QRCode', 'DataMatrix'], tryHarder: true, maxNumberOfSymbols: 60 };
  let zxingReady = false;

  function barcodeReaderLoaded() {
    if (typeof ZXingWASM === 'undefined') return false;
    if (!zxingReady) {
      // ZXING_WASM_URL lets tests point at a local copy of the reader.
      const url = window.ZXING_WASM_URL || 'https://cdn.jsdelivr.net/npm/zxing-wasm@3.1.4/dist/reader/zxing_reader.wasm';
      ZXingWASM.prepareZXingModule({ overrides: { locateFile: (path, prefix) => (path.endsWith('.wasm') ? url : prefix + path) } });
      zxingReady = true;
    }
    return true;
  }

  async function readBarcodes(imageData, options) {
    if (!barcodeReaderLoaded()) return [];
    const results = await ZXingWASM.readBarcodes(imageData, Object.assign({}, BARCODE_OPTIONS, options));
    return results.filter((r) => r.isValid !== false && r.text);
  }

  async function onFiles(e) {
    const files = [...e.target.files];
    e.target.value = '';
    if (!files.length) return;
    if (typeof ZXingWASM === 'undefined' && typeof Tesseract === 'undefined') {
      toast('Scanner did not load. Connect to the internet and reload.');
      return;
    }
    try {
      for (let i = 0; i < files.length; i++) {
        status('Photo ' + (i + 1) + ' of ' + files.length + ': preparing…');
        await scanFile(files[i], i + 1, files.length);
      }
      status('');
    } catch (err) {
      console.error(err);
      status('Something went wrong: ' + (err && err.message ? err.message : err));
    }
  }

  async function scanFile(file, n, total) {
    const canvas = await prepareImage(file);
    const label = 'Photo ' + n + ' of ' + total + ': ';
    const fallback = $('fallback-aisle').value;

    // 1. Barcodes: fast and exact.
    status(label + 'reading barcodes…');
    let codes = [];
    try {
      codes = await readBarcodes(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height));
    } catch (err) {
      console.error(err);
    }
    const bc = Parser.barcodeTokens(codes);
    let aisles = bc.aisles;
    let jobs = bc.jobs;

    // 2. Printed text: only if barcodes missed the jobs or the shelf, or the user asked for it.
    if ((!jobs.length || !aisles.length || $('also-text').checked) && typeof Tesseract !== 'undefined') {
      const w = await getWorker();
      status(label + 'reading printed text…');
      // Auto layout first. If job numbers or the shelf number are still missing, read again treating
      // the photo as scattered labels (better for a lone "B12-E"), and combine what both reads found.
      await w.setParameters({ tessedit_pageseg_mode: '3' });
      let lines = (await w.recognize(canvas)).data.lines || [];
      let t = Parser.findTokens(lines);
      if (!(jobs.length || t.jobs.length) || !(aisles.length || t.aisles.length)) {
        status(label + 'looking for missed labels…');
        await w.setParameters({ tessedit_pageseg_mode: '11' });
        lines = lines.concat((await w.recognize(canvas)).data.lines || []);
        t = Parser.findTokens(lines);
      }
      // Keep barcode readings; add text readings only for jobs/shelves the barcodes didn't find.
      const jobSet = new Set(jobs.map((j) => j.job));
      const aisleSet = new Set(aisles.map((a) => a.aisle));
      jobs = jobs.concat(t.jobs.filter((j) => !jobSet.has(j.job)));
      aisles = aisles.concat(t.aisles.filter((a) => !aisleSet.has(a.aisle)));
    }
    const result = Object.assign(Parser.pairUp(aisles, jobs, fallback), { other: bc.other, barcodes: codes.length });
    drawPreview(canvas, result, file.name || 'Photo ' + n);
    result.pairs.forEach((p) => review.push({ job: p.job, aisle: p.aisle, on: !p.unclear, guessed: p.guessed, unclear: p.unclear }));
    if (!result.pairs.length) toast('No job numbers found in photo ' + n + '. Try a closer, sharper photo.');
    renderReview();
  }

  // Shrink large photos and boost contrast; this makes reading faster and more accurate.
  async function prepareImage(file) {
    const img = await loadImage(file);
    const MAX = 3000;
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
    let cap = result.aisles.length + ' shelf label(s), ' + result.pairs.length + ' job(s) found (' +
      (result.barcodes || 0) + ' barcode' + (result.barcodes === 1 ? '' : 's') + ' read) — ' + name;
    if (result.other && result.other.length) cap += '. Other barcodes ignored: ' + result.other.slice(0, 6).join(', ');
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
        el('td', {}, aisleInput, r.guessed ? el('span', { class: 'flag' }, 'no shelf label found') : null),
        el('td', {}, jobInput, r.unclear ? el('span', { class: 'flag' }, 'unclear – scratched?') : null),
        el('td', {}, el('button', { type: 'button', class: 'x', 'aria-label': 'Remove row', onclick: () => { review.splice(i, 1); renderReview(); } }, '✕'))));
    });
    $('review').hidden = review.length === 0;
    const n = review.filter((r) => r.on).length;
    $('save-review').textContent = 'Save ' + n + ' entr' + (n === 1 ? 'y' : 'ies');
    $('save-review').disabled = n === 0;
  }

  // ---------- Live barcode scan ----------
  // Reads barcodes from the camera continuously. A shelf barcode sets the current shelf; each new job
  // barcode is added under it. If a shelf and jobs are in view together, each job goes to the shelf above it.
  const live = { stream: null, timer: null, busy: false, shelf: '', seen: new Set(), recent: new Map(), added: 0 };

  $('live-btn').addEventListener('click', startLive);
  $('live-done').addEventListener('click', stopLive);

  async function startLive() {
    if (!barcodeReaderLoaded()) { toast('Barcode reader did not load. Connect to the internet and reload.'); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('This browser cannot open the camera. Use "Take photo" instead.'); return; }
    try {
      live.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
    } catch (err) {
      toast('Camera not available: ' + (err && err.message ? err.message : err) + '. Allow camera access and try again.');
      return;
    }
    live.shelf = Parser.normalizeAisle($('fallback-aisle').value) || '';
    live.seen = new Set(review.map((r) => r.job + '|' + Parser.normalizeAisle(r.aisle)));
    live.recent = new Map();
    live.added = 0;
    $('live-list').replaceChildren();
    showShelf();
    liveMsg('Point the camera at a shelf barcode, then at the job barcodes on that shelf.');
    $('live').hidden = false;
    document.body.style.overflow = 'hidden';
    const video = $('live-video');
    video.srcObject = live.stream;
    await video.play().catch(() => {});
    live.timer = setInterval(liveTick, 200);
  }

  function stopLive() {
    clearInterval(live.timer);
    live.timer = null;
    if (live.stream) live.stream.getTracks().forEach((t) => t.stop());
    live.stream = null;
    $('live-video').srcObject = null;
    $('live').hidden = true;
    document.body.style.overflow = '';
    renderReview();
    if (live.added) {
      toast('Scanned ' + live.added + ' job' + (live.added === 1 ? '' : 's') + '. Check them, then tap Save.');
      $('review').scrollIntoView({ behavior: 'smooth' });
    }
  }

  function showShelf() {
    $('live-shelf').textContent = live.shelf || 'none yet';
  }

  function liveMsg(text, kind) {
    const m = $('live-msg');
    m.textContent = text;
    m.className = 'live-msg' + (kind ? ' ' + kind : '');
  }

  const frame = document.createElement('canvas');
  async function liveTick() {
    const video = $('live-video');
    if (live.busy || !video.videoWidth) return;
    live.busy = true;
    try {
      frame.width = video.videoWidth;
      frame.height = video.videoHeight;
      const ctx = frame.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0);
      const codes = await readBarcodes(ctx.getImageData(0, 0, frame.width, frame.height), { maxNumberOfSymbols: 20 });
      if (live.timer) handleLiveCodes(codes);
      drawLiveBoxes(codes);
    } catch (err) {
      console.error(err);
    } finally {
      live.busy = false;
    }
  }

  function handleLiveCodes(codes) {
    if (!codes.length) return;
    const t = Parser.barcodeTokens(codes);
    if (t.aisles.length) {
      // With several shelf labels in view, the top-most one becomes the current shelf.
      const top = t.aisles.slice().sort((a, b) => a.bbox.y0 - b.bbox.y0)[0];
      if (top.aisle !== live.shelf) {
        live.shelf = top.aisle;
        showShelf();
        beep(660);
        liveMsg('Shelf ' + live.shelf + '. Now scan the job barcodes.', 'ok');
      }
    }
    if (!t.jobs.length) return;
    const pairs = t.aisles.length ? Parser.pairUp(t.aisles, t.jobs, live.shelf).pairs
      : t.jobs.map((j) => ({ job: j.job, aisle: live.shelf }));
    const fresh = [];
    pairs.forEach((p) => {
      if (!p.aisle) return;
      const k = p.job + '|' + p.aisle;
      if (live.seen.has(k)) return;
      // A job just scanned under another shelf is probably still in view while moving to the next
      // shelf; don't file it under the new shelf too.
      const last = live.recent.get(p.job);
      if (last && last.aisle !== p.aisle && Date.now() - last.at < 4000) return;
      live.recent.set(p.job, { aisle: p.aisle, at: Date.now() });
      live.seen.add(k);
      review.push({ job: p.job, aisle: p.aisle, on: true });
      live.added++;
      fresh.push(p);
      $('live-list').prepend(el('div', {}, 'JOB ' + p.job + ' → ', el('b', {}, p.aisle)));
    });
    if (!live.shelf && !t.aisles.length) {
      liveMsg('Scan the shelf barcode first (or type the shelf before starting).', 'warn');
    } else if (fresh.length) {
      beep(880);
      liveMsg('Added ' + fresh.map((p) => p.job).join(', ') + ' → ' + fresh[0].aisle + '  (' + live.added + ' this scan)', 'ok');
    }
  }

  function drawLiveBoxes(codes) {
    const video = $('live-video');
    const c = $('live-overlay');
    // Match the overlay to how the video is shown on screen.
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.style.width = video.clientWidth + 'px';
    c.style.height = video.clientHeight + 'px';
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.lineWidth = Math.max(3, c.width / 200);
    codes.forEach((r) => {
      const p = r.position;
      if (!p) return;
      const kind = Parser.classifyCode(r.text);
      ctx.strokeStyle = !kind ? '#8b949e' : kind.type === 'shelf' ? '#58a6ff' : '#3fb950';
      ctx.beginPath();
      ctx.moveTo(p.topLeft.x, p.topLeft.y);
      ctx.lineTo(p.topRight.x, p.topRight.y);
      ctx.lineTo(p.bottomRight.x, p.bottomRight.y);
      ctx.lineTo(p.bottomLeft.x, p.bottomLeft.y);
      ctx.closePath();
      ctx.stroke();
    });
  }

  let audio = null;
  function beep(freq) {
    try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) { /* ignore */ }
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = freq;
      g.gain.value = 0.08;
      o.connect(g);
      g.connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + 0.09);
    } catch (e) { /* sound is optional */ }
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
    if (bad.length && !confirm(bad.length + ' row(s) do not look like a "B12-E" / "B12" shelf and an 8-digit job number. Save anyway?')) return;
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
