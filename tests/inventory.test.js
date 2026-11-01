// Run with: node tests/inventory.test.js
const assert = require('assert');
const I = require('../inventory.js');

assert.strictEqual(I.PARTS.length, 29);
assert.strictEqual(new Set(I.PARTS).size, 29);
['PMATIS00S.501', 'PMATIS00S.50', 'PMATIS00C.501', 'PMATIS00C.50', 'PMATIS07S.50', 'PMATIS07S.501', 'PMATIS15C.50']
  .forEach((p) => assert.ok(I.PARTS.includes(p), p));
assert.deepStrictEqual([...new Set(I.PARTS.map(I.family))], ['GIOTT', 'RAFF', 'MATIS']);

const s = I.emptyState();
assert.strictEqual(I.change(s, 'PRAFF02C.00', 1), true);
I.change(s, 'PRAFF02C.00', 1);
I.change(s, 'PMATIS10S.501', 1);
assert.strictEqual(s.counts['PRAFF02C.00'], 2);
assert.strictEqual(I.total(s), 3);

// Remove a count; never below zero.
assert.strictEqual(I.change(s, 'PMATIS10S.501', -1), true);
assert.strictEqual(s.counts['PMATIS10S.501'], 0);
assert.strictEqual(I.change(s, 'PMATIS10S.501', -1), false);
assert.strictEqual(s.counts['PMATIS10S.501'], 0);

// Undo reverses the last change (the -1), then the +1 before it.
assert.deepStrictEqual(I.undo(s), { part: 'PMATIS10S.501', delta: -1 });
assert.strictEqual(s.counts['PMATIS10S.501'], 1);
I.undo(s);
assert.strictEqual(s.counts['PMATIS10S.501'], 0);
I.undo(s);
I.undo(s);
assert.strictEqual(s.counts['PRAFF02C.00'], 0);
assert.strictEqual(I.undo(s), null);

console.log('All inventory tests passed');
