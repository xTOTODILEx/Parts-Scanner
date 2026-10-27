(function () {
  'use strict';

  const STORE_KEY = 'badPartFinder.scans.v1';
  const PO_KEY = 'badPartFinder.po.v1';
  const BAD = 'BAD PART';
  const OK = 'Not problematic';
  const $ = (id) => document.getElementById(id);

  // ---------- Storage ----------
  // Each scan: { po, code, mat, result: 'BAD PART' | 'Not problematic', at: ISO date }
  let scans = load(STORE_KEY, []);
  let currentPo = load(PO_KEY, '');

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      const v = raw ? JSON.parse(raw) : fallback;
      return Array.isArray(fallback) ? (Array.isArray(v) ? v : fallback) : (typeof v === 'string' ? v : fallback);
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      toast('Could not save on this phone: ' + e.message);
    }
  }

  function persist() {
    save(STORE_KEY, scans);
    updateCount();
    renderPos();
    renderRecent();
  }

  function updateCount() {
    const bad = scans.filter((s) => s.result === BAD).length;
    $('count').textContent = scans.length + ' scanned · ' + bad + ' bad';
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

  function fmtTime(iso) {
    try { return new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { return ''; }
  }

  // ---------- Tabs ----------
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
  function showTab(name) {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.panel').forEach((p) => { p.hidden = p.id !== 'tab-' + name; });
    if (name === 'data') renderEntries();
  }

  // ---------- POs ----------
  function renderPos() {
    const found = new Set(scans.filter((s) => s.result === BAD).map((s) => s.code));
    const list = $('po-list');
    list.replaceChildren();
    Parts.POS.forEach((p) => {
      const nFound = p.parts.filter((x) => found.has(x.code)).length;
      const selected = currentPo === p.po;
      list.append(el('div', { class: 'po-card' + (selected ? ' selected' : '') },
        el('button', { type: 'button', class: 'po-pick', onclick: () => setPo(selected ? '' : p.po) },
          el('span', { class: 'po-num' }, p.po),
          el('span', { class: 'po-sub' }, p.poMads.join(' / ')),
          el('span', { class: 'po-sub' }, 'DMG order ' + p.dmgOrders.join(', ')),
          el('span', { class: 'po-count' + (nFound ? ' hit' : '') },
            p.parts.length + ' bad part' + (p.parts.length === 1 ? '' : 's') + ' · ' + nFound + ' found'),
          selected ? el('span', { class: 'po-tick' }, '✓ checking') : null),
        el('details', { class: 'po-serials' },
          el('summary', {}, 'Bad serial numbers'),
          el('ul', {}, p.parts.map((x) => el('li', { class: found.has(x.code) ? 'found' : '' },
            x.code, found.has(x.code) ? ' 🚩 found' : '', el('small', {}, ' ' + x.poMad + ' · ' + x.dmgOrder)))))));
    });
    $('current-po').textContent = currentPo || 'none picked';
  }

  function setPo(po) {
    currentPo = po;
    save(PO_KEY, currentPo);
    renderPos();
  }

  // ---------- Checking a part ----------
  // Check one scanned or typed value. Saves the part the first time it is seen.
  // Returns null if it is not a part code, otherwise { code, mat, bad, scan, isNew }.
  function checkPart(text) {
    const part = Parts.readPartCode(text);
    if (!part) return null;
    const bad = Parts.findBad(part.code);
    let scan = scans.find((s) => s.code === part.code);
    const isNew = !scan;
    if (isNew) {
      scan = {
        // The PO of the box being checked; for a bad part with no PO picked, the PO it is listed under.
        po: currentPo || (bad ? bad.po : ''),
        code: part.code,
        mat: part.mat,
        result: bad ? BAD : OK,
        at: new Date().toISOString(),
      };
      scans.push(scan);
      persist();
    }
    return { code: part.code, mat: part.mat, bad, scan, isNew };
  }

  function resultCard(r) {
    const notes = [];
    if (!r.isNew) notes.push('Already scanned ' + fmtTime(r.scan.at) + (r.scan.po ? ' (PO ' + r.scan.po + ')' : '') + '.');
    if (r.bad) {
      if (currentPo && currentPo !== r.bad.po) notes.push('Listed under PO ' + r.bad.po + ', not the PO you picked (' + currentPo + ').');
      return el('div', { class: 'result bad' },
        el('div', { class: 'result-title' }, '🚩 BAD PART'),
        el('div', { class: 'result-text' }, 'This is the troublesome part. Set it aside.'),
        el('div', { class: 'result-code' }, r.code),
        el('div', { class: 'result-meta' }, 'PO ' + r.bad.po + ' (' + r.bad.poMad + ') · DMG order ' + r.bad.dmgOrder + (r.mat ? ' · mat ' + r.mat : '')),
        notes.map((n) => el('div', { class: 'result-note' }, n)));
    }
    return el('div', { class: 'result ok' },
      el('div', { class: 'result-title' }, '✓ Not a problematic part'),
      el('div', { class: 'result-code' }, r.code),
      r.mat ? el('div', { class: 'result-meta' }, 'mat ' + r.mat) : null,
      notes.map((n) => el('div', { class: 'result-note' }, n)));
  }

  function showResults(list, extra) {
    const out = $('results');
    out.replaceChildren();
    if (extra) out.append(extra);
    // Bad parts first.
    list.slice().sort((a, b) => (b.bad ? 1 : 0) - (a.bad ? 1 : 0)).forEach((r) => out.append(resultCard(r)));
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderRecent() {
    const box = $('recent');
    box.replaceChildren();
    const last = scans.slice(-8).reverse();
    if (!last.length) {
      box.append(el('p', { class: 'muted' }, 'Nothing scanned yet.'));
      return;
    }
    last.forEach((s) => box.append(entryRow(s)));
  }

  function entryRow(s, onDelete) {
    return el('div', { class: 'entry' },
      el('div', {},
        el('span', { class: 'badge ' + (s.result === BAD ? 'bad' : 'ok') }, s.result === BAD ? '🚩 BAD' : '✓ OK'),
        ' ', el('b', {}, s.code),
        el('small', {}, (s.po ? 'PO ' + s.po + ' · ' : 'no PO · ') + fmtTime(s.at))),
      onDelete ? el('button', { class: 'x', 'aria-label': 'Delete', onclick: onDelete }, '🗑') : null);
  }

  $('manual-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const r = checkPart($('manual-code').value);
    if (!r) { toast('That doesn\'t look like a GA/NA serial number'); return; }
    if (r.bad) alarm(); else beep(880);
    showResults([r]);
    $('manual-code').value = '';
  });

  // ---------- Feedback ----------
  let audio = null;
  function tone(freq, start, len) {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const o = audio.createOscillator();
    const g = audio.createGain();
    o.frequency.value = freq;
    g.gain.value = 0.12;
    o.connect(g);
    g.connect(audio.destination);
    o.start(audio.currentTime + start);
    o.stop(audio.currentTime + start + len);
  }

  function beep(freq) {
    try { if (navigator.vibrate) navigator.vibrate(60); } catch (e) { /* ignore */ }
    try { tone(freq, 0, 0.09); } catch (e) { /* sound is optional */ }
  }

  // Bad part: long buzz and a low two-tone alarm.
  function alarm() {
    try { if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]); } catch (e) { /* ignore */ }
    try { tone(330, 0, 0.25); tone(220, 0.3, 0.25); tone(330, 0.6, 0.25); } catch (e) { /* sound is optional */ }
  }

  // ---------- Photos ----------
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
    if (!barcodeReaderLoaded()) { toast('Scanner did not load. Connect to the internet and reload.'); return; }
    const all = [];
    const previews = el('div', {});
    try {
      for (let i = 0; i < files.length; i++) {
        const res = await scanPhoto(files[i], 'Photo ' + (i + 1) + ' of ' + files.length + ': ', false);
        all.push(...res.results);
        previews.append(res.card);
      }
    } catch (err) {
      console.error(err);
      toast('Something went wrong: ' + (err && err.message ? err.message : err));
    }
    status('');
    finishPhotos(all, previews);
  }

  function finishPhotos(all, previews) {
    const nBad = all.filter((r) => r.bad).length;
    if (nBad) alarm(); else if (all.length) beep(880);
    const summary = el('div', { class: 'summary ' + (nBad ? 'bad' : all.length ? 'ok' : '') },
      all.length
        ? (nBad ? '🚩 ' + nBad + ' BAD part' + (nBad === 1 ? '' : 's') + ' in ' : '✓ No bad parts in ') + all.length + ' part' + (all.length === 1 ? '' : 's') + ' scanned'
        : 'No part QR codes found. Try "Scan harder", or a closer, sharper photo.');
    showResults(all, el('div', {}, summary, previews));
  }

  // Read every part QR code in one photo. Returns { results, card } where card shows the photo
  // with bad parts boxed in red and good parts in green.
  async function scanPhoto(file, label, deep) {
    status(label + 'reading QR codes…');
    const canvas = await prepareImage(file);
    const progress = (msg) => status(label + msg);
    let codes = await readAllBarcodes(canvas, progress, { whole: true, zoom: deep });
    if (!deep && !codes.some((c) => Parts.readPartCode(c.text))) {
      // Nothing found: the QR codes may just be small in the photo, so zoom in.
      codes = await readAllBarcodes(canvas, progress, { zoom: true }, codes);
    }
    const results = [];
    const seen = new Set();
    const marks = [];
    codes.forEach((c) => {
      const r = checkPart(c.text);
      marks.push({ position: c.position, kind: r ? (r.bad ? 'bad' : 'ok') : 'other' });
      if (r && !seen.has(r.code)) { seen.add(r.code); results.push(r); }
    });
    const card = photoCard(canvas, marks, results, file, label);
    return { results, card };
  }

  function photoCard(src, marks, results, file) {
    const c = document.createElement('canvas');
    const scale = Math.min(1, 1200 / src.width);
    c.width = Math.round(src.width * scale);
    c.height = Math.round(src.height * scale);
    const ctx = c.getContext('2d');
    ctx.drawImage(src, 0, 0, c.width, c.height);
    marks.forEach((m) => drawQuad(ctx, m.position, scale, m.kind, Math.max(3, c.width / 150)));
    const nBad = results.filter((r) => r.bad).length;
    const card = el('div', { class: 'preview' }, c,
      el('div', { class: 'cap' }, results.length + ' part' + (results.length === 1 ? '' : 's') + ' found' +
        (nBad ? ', ' + nBad + ' bad (red box)' : '') + ' — ' + (file.name || 'photo')));
    card.append(el('button', { type: 'button', class: 'harder', onclick: async (e) => {
      e.target.disabled = true;
      try {
        const res = await scanPhoto(file, 'Scanning harder: ', true);
        card.replaceWith(res.card);
        finishPhotos(res.results, el('div', {}, res.card));
      } finally {
        status('');
      }
    } }, '🔍 Scan harder (missed some?)'));
    return card;
  }

  const MARK_COLORS = { bad: '#ff1f2d', ok: '#2ea043', other: '#8b949e' };
  function drawQuad(ctx, p, scale, kind, width) {
    if (!p) return;
    ctx.strokeStyle = MARK_COLORS[kind];
    ctx.lineWidth = kind === 'bad' ? width * 2 : width;
    ctx.beginPath();
    ctx.moveTo(p.topLeft.x * scale, p.topLeft.y * scale);
    ctx.lineTo(p.topRight.x * scale, p.topRight.y * scale);
    ctx.lineTo(p.bottomRight.x * scale, p.bottomRight.y * scale);
    ctx.lineTo(p.bottomLeft.x * scale, p.bottomLeft.y * scale);
    ctx.closePath();
    ctx.stroke();
  }

  // ---------- Live camera scan ----------
  // Reads QR codes from the camera. As soon as a part's QR code is read, the camera closes and the
  // result is shown on the main screen.
  const live = { stream: null, timer: null, busy: false };

  $('live-btn').addEventListener('click', startLive);
  $('live-done').addEventListener('click', stopLive);

  async function startLive() {
    if (!barcodeReaderLoaded()) { toast('Scanner did not load. Connect to the internet and reload.'); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { toast('This browser cannot open the camera. Use "Photo" instead.'); return; }
    try {
      live.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      });
    } catch (err) {
      toast('Camera not available: ' + (err && err.message ? err.message : err) + '. Allow camera access and try again.');
      return;
    }
    $('live-po').textContent = currentPo || 'none picked';
    liveMsg('Point the camera at a part\'s QR code.');
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
  }

  function liveMsg(text) {
    $('live-msg').textContent = text;
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
      const codes = await readBarcodes(ctx.getImageData(0, 0, frame.width, frame.height), { maxNumberOfSymbols: 10 });
      if (live.timer) handleLiveCodes(codes);
    } catch (err) {
      console.error(err);
    } finally {
      live.busy = false;
    }
  }

  function handleLiveCodes(codes) {
    const parts = codes.filter((code) => Parts.readPartCode(code.text));
    if (!parts.length) {
      // Show other QR codes in grey so it is clear they were seen but are not part labels.
      const c = $('live-overlay');
      const video = $('live-video');
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      c.style.width = video.clientWidth + 'px';
      c.style.height = video.clientHeight + 'px';
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      codes.forEach((code) => drawQuad(ctx, code.position, 1, 'other', Math.max(3, c.width / 200)));
      if (codes.length) liveMsg('That code isn\'t a part QR code. Point at the part\'s QR label.');
      return;
    }
    // A part was read: close the camera and show the result (every part in view, if several).
    stopLive();
    const results = [];
    parts.forEach((code) => {
      const r = checkPart(code.text);
      if (!results.some((x) => x.code === r.code)) results.push(r);
    });
    if (results.some((r) => r.bad)) alarm(); else beep(880);
    showResults(results);
  }

  // ---------- Excel / history ----------
  $('export-btn').addEventListener('click', () => {
    if (typeof XLSX === 'undefined') { toast('Excel library did not load. Connect to the internet and reload.'); return; }
    const rows = scans.map((s) => ({ 'PO': s.po, 'GA/NA code': s.code, 'result': s.result }));
    const found = new Set(scans.filter((s) => s.result === BAD).map((s) => s.code));
    const list = Parts.BAD_PARTS.map((p) => ({
      'Serial number': p.code, 'DMG Order': p.dmgOrder, 'PO MAD': p.poMad, 'Found': found.has(p.code) ? 'Yes' : 'No',
    }));
    const wb = XLSX.utils.book_new();
    const s1 = XLSX.utils.json_to_sheet(rows, { header: ['PO', 'GA/NA code', 'result'] });
    s1['!cols'] = [{ wch: 10 }, { wch: 14 }, { wch: 16 }];
    const s2 = XLSX.utils.json_to_sheet(list, { header: ['Serial number', 'DMG Order', 'PO MAD', 'Found'] });
    s2['!cols'] = [{ wch: 14 }, { wch: 11 }, { wch: 18 }, { wch: 7 }];
    XLSX.utils.book_append_sheet(wb, s1, 'Scanned parts');
    XLSX.utils.book_append_sheet(wb, s2, 'Bad parts list');
    XLSX.writeFile(wb, 'bad-part-scans-' + new Date().toISOString().slice(0, 10) + '.xlsx');
  });

  $('filter-input').addEventListener('input', renderEntries);

  function renderEntries() {
    const q = $('filter-input').value.trim().toUpperCase();
    const list = scans.map((s, i) => ({ s, i }))
      .filter(({ s }) => !q || (s.po + ' ' + s.code + ' ' + s.result).toUpperCase().includes(q))
      .reverse();
    const box = $('entries');
    box.replaceChildren();
    if (!list.length) {
      box.append(el('p', { class: 'muted' }, scans.length ? 'No matches.' : 'No parts scanned yet.'));
      return;
    }
    list.slice(0, 500).forEach(({ s, i }) => box.append(entryRow(s, () => {
      if (!confirm('Delete scan of ' + s.code + '?')) return;
      scans.splice(i, 1);
      persist();
      renderEntries();
    })));
  }

  $('clear-all').addEventListener('click', () => {
    if (!scans.length) return;
    if (!confirm('Delete ALL ' + scans.length + ' scans from this phone? Export to Excel first if you want to keep them.')) return;
    scans = [];
    persist();
    renderEntries();
    $('results').replaceChildren();
  });

  // ---------- Barcode reader ----------
  const BARCODE_OPTIONS = { formats: ['QRCode', 'MicroQRCode', 'DataMatrix', 'AllLinear'], tryHarder: true, maxNumberOfSymbols: 60 };
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


  // Read every barcode in a photo. How well barcodes read depends on their size in pixels, so the whole
  // photo is read at several sizes and the results merged. With deep = true it also zooms into
  // overlapping sections, which finds small barcodes in a photo taken from further away (slower).
  async function readAllBarcodes(canvas, progress, passes, found) {
    const W = canvas.width;
    const H = canvas.height;
    found = found || [];
    const tmp = document.createElement('canvas');
    const tctx = tmp.getContext('2d', { willReadFrequently: true });
    tctx.imageSmoothingQuality = 'high';

    // Read the region (x, y, w, h) of the photo, resized so its longest side is `side` pixels.
    // Whole-photo reads only shrink; zoomed sections may be enlarged up to 3x.
    async function readRegion(x, y, w, h, side, maxZoom) {
      const k = Math.min(maxZoom, side / Math.max(w, h));
      tmp.width = Math.round(w * k);
      tmp.height = Math.round(h * k);
      tctx.imageSmoothingQuality = 'high';
      tctx.drawImage(canvas, x, y, w, h, 0, 0, tmp.width, tmp.height);
      const list = await readBarcodes(tctx.getImageData(0, 0, tmp.width, tmp.height));
      list.forEach((r) => {
        const pos = {};
        ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'].forEach((c) => {
          pos[c] = { x: r.position[c].x / k + x, y: r.position[c].y / k + y };
        });
        const cx = (pos.topLeft.x + pos.bottomRight.x) / 2;
        const cy = (pos.topLeft.y + pos.bottomRight.y) / 2;
        const size = Math.max(20, Math.hypot(pos.topRight.x - pos.topLeft.x, pos.topRight.y - pos.topLeft.y));
        // The same barcode found in another pass is only kept once.
        if (found.some((f) => f.text === r.text && Math.hypot(f.cx - cx, f.cy - cy) < size)) return;
        found.push({ text: r.text, format: r.format, position: pos, cx, cy });
      });
    }

    const long = Math.max(W, H);
    const sizes = [1400, 2000, 2800, long].filter((v, i, a) => v <= long && a.indexOf(v) === i);
    if (passes.whole) {
      for (const size of sizes) {
        progress('reading QR codes… (' + found.length + ' found)');
        await readRegion(0, 0, W, H, size, 1);
      }
    }
    if (!passes.zoom) return found;
    // Overlapping sections (4 x 4), zoomed in.
    for (const n of [4]) {
      const tw = Math.min(W, Math.ceil((W / n) * 1.4));
      const th = Math.min(H, Math.ceil((H / n) * 1.4));
      for (let row = 0; row < n; row++) {
        for (let col = 0; col < n; col++) {
          progress('zooming in for small QR codes… (' + found.length + ' found)');
          const x = Math.max(0, Math.min(W - tw, Math.round(((col + 0.5) * W) / n - tw / 2)));
          const y = Math.max(0, Math.min(H - th, Math.round(((row + 0.5) * H) / n - th / 2)));
          await readRegion(x, y, tw, th, 3200, 3);
        }
      }
    }
    return found;
  }

  // Keep full detail for small barcodes (up to 4096 px) and boost contrast.
  async function prepareImage(file) {
    const img = await loadImage(file);
    const MAX = 4096;
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

  // ---------- Start ----------
  updateCount();
  renderPos();
  renderRecent();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
