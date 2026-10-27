// Run with: node tests/parts.test.js
const assert = require('assert');
const P = require('../parts.js');

// QR link from a part label.
assert.deepStrictEqual(P.readPartCode('https://mydmg.dmg.it/it/qr/?mat=16080625$$GA2604429'), { code: 'GA2604429', mat: '16080625' });
assert.deepStrictEqual(P.readPartCode('https://mydmg.dmg.it/it/qr/?mat=16080625$$GA260846L'), { code: 'GA260846L', mat: '16080625' });
// URL-encoded "$$", NA codes, typed codes, extra text after the code.
assert.strictEqual(P.readPartCode('https://mydmg.dmg.it/it/qr/?mat=1%24%24NA1234567').code, 'NA1234567');
assert.strictEqual(P.readPartCode(' ga260846l ').code, 'GA260846L');
assert.strictEqual(P.readPartCode('https://mydmg.dmg.it/it/qr/?mat=16080625$$GA261277G&x=1').code, 'GA261277G');
// Not a part code.
assert.strictEqual(P.readPartCode('https://example.com/?id=12345'), null);
assert.strictEqual(P.readPartCode(''), null);

// Bad part lookup.
assert.strictEqual(P.findBad('GA2604429'), null);
assert.deepStrictEqual(P.findBad('ga260846l'), { code: 'GA260846L', dmgOrder: '1397-2026', poMad: 'FCSTPO167742', po: '167742' });
assert.strictEqual(P.findBad('GA260849R').po, '161945');

// The four POs with their bad parts.
assert.deepStrictEqual(P.POS.map((p) => [p.po, p.parts.length]), [['166690', 6], ['167742', 1], ['161945', 3], ['167923', 3]]);
assert.deepStrictEqual(P.POS[2].poMads, ['161945_AUGUST', '161945_SEPTEMBER']);
assert.strictEqual(P.BAD_PARTS.length, 13);

console.log('All parts tests passed');
