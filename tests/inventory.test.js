// Run with: node tests/inventory.test.js
const assert = require('assert');
const I = require('../inventory.js');

assert.strictEqual(I.PARTS.length, 35);
assert.strictEqual(new Set(I.PARTS).size, 35);
['PMATIS00S.501', 'PMATIS00S.50', 'PMATIS00C.501', 'PMATIS00C.50', 'PMATIS07S.50', 'PMATIS07S.501', 'PMATIS15C.50']
  .forEach((p) => assert.ok(I.PARTS.includes(p), p));
assert.deepStrictEqual([...new Set(I.PARTS.map(I.family))], ['GIOTT', 'RAFF', 'MATIS', 'ECS']);

// Three categories, every part in exactly one of them.
const g = I.groups();
assert.deepStrictEqual(g.map((x) => [x.name, x.parts.length]), [['GIOTTOS', 6], ['RAFFAELLOS', 6], ['MATISSES', 18], ['ECS PARTS', 5]]);
assert.ok(g[0].parts.every((p) => p.startsWith('PGIOT')));
assert.ok(g[1].parts.every((p) => p.startsWith('PRAFF')));
assert.ok(g[2].parts.every((p) => p.startsWith('PMATIS')));
assert.ok(g[2].parts.includes('PMATIS15S.50'));
assert.deepStrictEqual(g[3].parts, ['E.PMATIS00C.501', 'E.PMATIS00S.501', 'E.PMATIS10C.50', 'E.PMATIS10C.501', 'E.PMATIS15C.50']);
assert.strictEqual(I.category('PXYZ01').name, 'OTHER');

const s = I.emptyState();
assert.strictEqual(I.change(s, 'PRAFF02C.00', 1), true);
I.change(s, 'PRAFF02C.00', 1);
I.change(s, 'PMATIS10S.501', 1);
assert.strictEqual(s.counts['PRAFF02C.00'], 2);
assert.strictEqual(I.total(s), 3);
assert.strictEqual(I.total(s, I.groups()[1].parts), 2);

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

// Typed amounts: add 60 at once, remove 60 (never below 0), undo the whole amount.
const t = I.emptyState();
I.change(t, 'PGIOTT07C', 60);
assert.strictEqual(t.counts.PGIOTT07C, 60);
I.change(t, 'PGIOTT07C', -100);
assert.strictEqual(t.counts.PGIOTT07C, 0);
assert.deepStrictEqual(I.undo(t), { part: 'PGIOTT07C', delta: -60 });
assert.strictEqual(t.counts.PGIOTT07C, 60);
assert.deepStrictEqual(I.undo(t), { part: 'PGIOTT07C', delta: 60 });
assert.strictEqual(t.counts.PGIOTT07C, 0);
assert.deepStrictEqual(['60', ' 12 ', '', '0', '-5', 'abc', '2.7', '1000000'].map(I.amount), [60, 12, 1, 1, 1, 1, 2, 99999]);

// Overstock + Stockroom.
const over = I.emptyState();
const stock = I.emptyState();
I.change(over, 'PRAFF02C.00', 5);
I.change(stock, 'PRAFF02C.00', 7);
I.change(stock, 'E.PMATIS10C.50', 3);
const both = I.combine(over, stock);
assert.strictEqual(both.counts['PRAFF02C.00'], 12);
assert.strictEqual(both.counts['E.PMATIS10C.50'], 3);
assert.strictEqual(I.total(both), 15);
assert.strictEqual(over.counts['PRAFF02C.00'], 5); // inputs unchanged

console.log('All inventory tests passed');
