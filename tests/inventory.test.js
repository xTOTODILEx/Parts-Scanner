// Run with: node tests/inventory.test.js
const assert = require('assert');
const I = require('../inventory.js');

assert.strictEqual(I.PARTS.length, 34);
assert.strictEqual(new Set(I.PARTS).size, 34);
['PMATIS00S.501', 'PMATIS00S.50', 'PMATIS00C.501', 'PMATIS00C.50', 'PMATIS07S.50', 'PMATIS07S.501', 'PMATIS15C.50']
  .forEach((p) => assert.ok(I.PARTS.includes(p), p));
assert.deepStrictEqual([...new Set(I.PARTS.map(I.family))], ['GIOTT', 'RAFF', 'MATIS', 'ECS']);

// Three categories, every part in exactly one of them.
const g = I.groups();
assert.deepStrictEqual(g.map((x) => [x.name, x.parts.length]), [['GIOTTOS', 6], ['RAFFAELLOS', 6], ['MATISSES', 18], ['ECS PARTS', 4]]);
assert.ok(g[0].parts.every((p) => p.startsWith('PGIOT')));
assert.ok(g[1].parts.every((p) => p.startsWith('PRAFF')));
assert.ok(g[2].parts.every((p) => p.startsWith('PMATIS')));
assert.ok(g[2].parts.includes('PMATIS15S.50'));
assert.deepStrictEqual(g[3].parts, ['E.PMATIS00C.501', 'E.PMATIS00S.501', 'E.PMATIS10C.501', 'E.PMATIS15C.50']);
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

console.log('All inventory tests passed');
