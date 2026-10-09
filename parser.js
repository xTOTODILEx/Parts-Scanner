// Turns OCR output into { aisle, job } pairs.
// Works in the browser (window.Parser) and in Node (module.exports) so it can be tested.
(function (root) {
  'use strict';

  // OCR often confuses these characters with digits.
  const DIGIT_FIX = { O: '0', Q: '0', D: '0', U: '0', I: '1', L: '1', '|': '1', '!': '1', T: '1', Z: '2', S: '5', G: '6', B: '8' };

  // "JOB: 12345678" (also J0B, JO8, missing colon, etc.)
  const JOB_RE = /J[O0Q][B8]\s*[:;.,]?\s*([0-9OQDUILTZSGB|!]{8})(?![0-9])/g;
  // "B12-E" (letter, 1-3 digits, dash, letter). Allows stray spaces and other dash characters.
  const AISLE_RE = /(?:^|[^A-Z0-9])([A-Z])\s?([0-9OQDILSZ]{1,3})\s?[-‐‑–—~_]\s?([A-Z])(?![A-Z0-9])/g;

  function fixDigits(s) {
    return s.split('').map((c) => DIGIT_FIX[c] || c).join('');
  }

  function normalizeJob(s) {
    let t = String(s || '').toUpperCase().replace(/^\s*J[O0Q][B8]\s*[:;.,]?\s*/, '');
    t = fixDigits(t.replace(/\s+/g, ''));
    return t.replace(/[^0-9]/g, '');
  }

  function normalizeAisle(s) {
    const t = String(s || '').toUpperCase().replace(/\s+/g, '').replace(/[‐‑–—~_]/g, '-');
    const m = t.match(/^([A-Z])([0-9A-Z]{1,3})-?([A-Z])$/);
    if (m) return m[1] + fixDigits(m[2]) + '-' + m[3];
    return t;
  }

  function isValidJob(j) { return /^\d{8}$/.test(j); }
  function isValidAisle(a) { return /^[A-Z]\d{1,3}-[A-Z]$/.test(a); }

  function unionBox(boxes) {
    return boxes.reduce((acc, b) => ({
      x0: Math.min(acc.x0, b.x0), y0: Math.min(acc.y0, b.y0),
      x1: Math.max(acc.x1, b.x1), y1: Math.max(acc.y1, b.y1),
    }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  }

  // Build one string per OCR line and remember which characters belong to which word,
  // so a regex match can be mapped back to a bounding box on the photo.
  function buildLine(line) {
    const words = (line.words && line.words.length) ? line.words : [{ text: line.text, bbox: line.bbox }];
    let text = '';
    const spans = [];
    words.forEach((w, i) => {
      if (i) text += ' ';
      const start = text.length;
      text += String(w.text || '').toUpperCase();
      spans.push({ start, end: text.length, bbox: w.bbox });
    });
    return { text, spans, bbox: line.bbox };
  }

  function boxForRange(built, start, end) {
    const hit = built.spans.filter((s) => s.end > start && s.start < end).map((s) => s.bbox);
    return hit.length ? unionBox(hit) : built.bbox;
  }

  function findTokens(lines) {
    const aisles = [];
    const jobs = [];
    lines.forEach((line) => {
      const built = buildLine(line);
      let m;
      JOB_RE.lastIndex = 0;
      while ((m = JOB_RE.exec(built.text))) {
        const job = fixDigits(m[1]);
        if (isValidJob(job)) jobs.push({ job, bbox: boxForRange(built, m.index, m.index + m[0].length) });
      }
      AISLE_RE.lastIndex = 0;
      while ((m = AISLE_RE.exec(built.text))) {
        const start = m.index + m[0].indexOf(m[1]);
        const aisle = m[1] + fixDigits(m[2]) + '-' + m[3];
        if (isValidAisle(aisle)) aisles.push({ aisle, bbox: boxForRange(built, start, m.index + m[0].length) });
        AISLE_RE.lastIndex = m.index + m[0].length;
      }
    });

    // Fallback: OCR sometimes puts "JOB:" and the number on separate lines.
    // Pair a lone "JOB" word with an 8-digit word just to its right at the same height.
    const words = [];
    lines.forEach((l) => (l.words || []).forEach((w) => words.push(w)));
    const used = (b) => jobs.some((j) => b.x0 >= j.bbox.x0 - 1 && b.x1 <= j.bbox.x1 + 1 && b.y0 >= j.bbox.y0 - 1 && b.y1 <= j.bbox.y1 + 1);
    const labels = words.filter((w) => /^J[O0Q][B8][:;.,]?$/.test(String(w.text).toUpperCase()) && !used(w.bbox));
    const numbers = words.filter((w) => isValidJob(fixDigits(String(w.text).toUpperCase().replace(/[^0-9A-Z|!]/g, ''))) && !used(w.bbox));
    labels.forEach((l) => {
      const h = Math.max(1, l.bbox.y1 - l.bbox.y0);
      const cy = (l.bbox.y0 + l.bbox.y1) / 2;
      let best = null;
      let bestDx = Infinity;
      numbers.forEach((n) => {
        const ncy = (n.bbox.y0 + n.bbox.y1) / 2;
        const dx = n.bbox.x0 - l.bbox.x1;
        if (Math.abs(ncy - cy) < h && dx > -h && dx < h * 4 && dx < bestDx) { best = n; bestDx = dx; }
      });
      if (best) {
        numbers.splice(numbers.indexOf(best), 1);
        const job = fixDigits(String(best.text).toUpperCase().replace(/[^0-9A-Z|!]/g, ''));
        jobs.push({ job, bbox: unionBox([l.bbox, best.bbox]) });
      }
    });
    return { aisles, jobs };
  }

  // Each job belongs to the closest aisle label printed above it.
  function assign(aisles, jobs, fallbackAisle) {
    const fallback = fallbackAisle ? normalizeAisle(fallbackAisle) : '';
    return jobs.map((j) => {
      const jc = { x: (j.bbox.x0 + j.bbox.x1) / 2, y: (j.bbox.y0 + j.bbox.y1) / 2 };
      const jh = Math.max(1, j.bbox.y1 - j.bbox.y0);
      let best = null;
      let bestScore = Infinity;
      aisles.forEach((a) => {
        const ac = { x: (a.bbox.x0 + a.bbox.x1) / 2, y: (a.bbox.y0 + a.bbox.y1) / 2 };
        const dy = jc.y - ac.y;
        const dx = Math.abs(jc.x - ac.x);
        // Strongly prefer labels that sit above the job; labels below only win if nothing is above.
        const below = dy < -jh * 0.5;
        const score = (below ? 1e6 : 0) + Math.abs(dy) + dx * 0.6;
        if (score < bestScore) { bestScore = score; best = a; }
      });
      const aisle = best ? best.aisle : fallback;
      return { job: j.job, aisle, jobBox: j.bbox, aisleBox: best ? best.bbox : null, guessed: !best };
    });
  }

  function parseOcr(data, fallbackAisle) {
    const lines = (data && data.lines) || [];
    const { aisles, jobs } = findTokens(lines);
    const pairs = assign(aisles, jobs, fallbackAisle);
    // Remove exact duplicates inside one photo.
    const seen = new Set();
    const unique = pairs.filter((p) => {
      const k = p.job + '|' + p.aisle;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    return { aisles, jobs, pairs: unique };
  }

  const api = { parseOcr, findTokens, assign, normalizeJob, normalizeAisle, isValidJob, isValidAisle };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Parser = api;
})(typeof window !== 'undefined' ? window : this);
