// Run with: node tests/parser.test.js
const assert = require('assert');
const P = require('../parser.js');

function word(text, x0, y0, x1, y1) { return { text, bbox: { x0, y0, x1, y1 } }; }
function line(...words) {
  const bbox = words.reduce((a, w) => ({
    x0: Math.min(a.x0, w.bbox.x0), y0: Math.min(a.y0, w.bbox.y0),
    x1: Math.max(a.x1, w.bbox.x1), y1: Math.max(a.y1, w.bbox.y1),
  }), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
  return { text: words.map((w) => w.text).join(' '), words, bbox };
}
const pairs = (r) => r.pairs.map((p) => p.job + ' ' + p.aisle);

// Two boxes side by side, each with an aisle label and jobs below it.
let r = P.parseOcr({ lines: [
  line(word('B12-E', 100, 50, 200, 80), word('B03-A', 600, 50, 700, 80)),
  line(word('JOB:', 80, 120, 140, 150), word('12345678', 150, 120, 300, 150),
       word('JOB:', 580, 120, 640, 150), word('87654321', 650, 120, 800, 150)),
  line(word('J0B:2468O135', 80, 170, 300, 200)),
] });
assert.deepStrictEqual(pairs(r), ['12345678 B12-E', '87654321 B03-A', '24680135 B12-E']);

// Two boxes stacked: second aisle label is lower, so its jobs go to it.
r = P.parseOcr({ lines: [
  line(word('B01-B', 100, 0, 200, 30)),
  line(word('JOB:', 100, 50, 150, 80), word('11111111', 160, 50, 300, 80)),
  line(word('B02-C', 100, 300, 200, 330)),
  line(word('JOB:', 100, 350, 150, 380), word('22222222', 160, 350, 300, 380)),
  line(word('JOB:', 100, 400, 150, 430), word('33333333', 160, 400, 300, 430)),
] });
assert.deepStrictEqual(pairs(r), ['11111111 B01-B', '22222222 B02-C', '33333333 B02-C']);

// No aisle in photo -> fallback aisle typed by user.
r = P.parseOcr({ lines: [line(word('JOB:44444444', 0, 0, 100, 20))] }, 'b7-f');
assert.deepStrictEqual(pairs(r), ['44444444 B7-F']);
assert.strictEqual(r.pairs[0].guessed, true);

// Split aisle tokens and odd dashes.
r = P.parseOcr({ lines: [line(word('B12', 0, 0, 50, 20), word('–', 55, 0, 60, 20), word('E', 65, 0, 80, 20)),
  line(word('JOB', 0, 40, 30, 60), word('55555555', 35, 40, 100, 60))] });
assert.deepStrictEqual(pairs(r), ['55555555 B12-E']);

// "JOB:" and number split onto separate OCR lines.
r = P.parseOcr({ lines: [line(word('B05-K', 0, 0, 60, 20)),
  line(word('JOB:', 0, 40, 40, 60)), line(word('66666666', 50, 41, 140, 61))] });
assert.deepStrictEqual(pairs(r), ['66666666 B05-K']);

// Shelf without the letter part, e.g. "B12".
r = P.parseOcr({ lines: [line(word('B12', 0, 0, 50, 20)), line(word('JOB:77777777', 0, 40, 120, 60))] });
assert.deepStrictEqual(pairs(r), ['77777777 B12']);

// OCR reading the B as an 8 is fixed when the -E part is there.
r = P.parseOcr({ lines: [line(word('812-E', 0, 0, 50, 20)), line(word('JOB:77777777', 0, 40, 120, 60))] });
assert.deepStrictEqual(pairs(r), ['77777777 B12-E']);

// Labels that don't start with B, plain numbers, and words like "BOD" are not shelves.
r = P.parseOcr({ lines: [line(word('C03-A', 0, 0, 50, 20), word('812', 60, 0, 90, 20), word('BOD', 100, 0, 130, 20)),
  line(word('JOB:77777777', 0, 40, 120, 60))] });
assert.deepStrictEqual(r.aisles, []);

// Scratched / unclear job labels are flagged so they start unticked.
const low = word('JOB:88888888', 0, 40, 120, 60); low.confidence = 20;
const ok = word('JOB:99999999', 0, 80, 120, 100); ok.confidence = 90;
r = P.parseOcr({ lines: [line(word('B12-E', 0, 0, 50, 20)), line(low), line(ok)] });
assert.deepStrictEqual(r.pairs.map((p) => p.job + ' ' + p.unclear), ['88888888 true', '99999999 false']);

// Normalizers
assert.strictEqual(P.normalizeJob('job: 1234 5678'), '12345678');
assert.strictEqual(P.normalizeAisle('b12 e'), 'B12-E');
assert.strictEqual(P.normalizeAisle('B1O-E'), 'B10-E');
assert.strictEqual(P.normalizeAisle('b12'), 'B12');
assert.strictEqual(P.normalizeAisle('812-E'), 'B12-E');
assert.ok(P.isValidAisle('B12') && P.isValidAisle('B12-E') && !P.isValidAisle('C03-A'));

console.log('All parser tests passed');
