// The list of bad parts, and reading a part's GA/NA code from its QR code.
// Works in the browser (window.Parts) and in Node (module.exports) so it can be tested.
(function (root) {
  'use strict';

  // Serial numbers (GA/NA codes) of the troublesome parts.
  // To change the list, edit these rows: code, DMG order, PO MAD.
  const BAD_PARTS = [
    ['GA260844J', '1236-2026', 'FCSTPO166690'],
    ['GA260846J', '1236-2026', 'FCSTPO166690'],
    ['GA260846L', '1397-2026', 'FCSTPO167742'],
    ['GA260846M', '1236-2026', 'FCSTPO166690'],
    ['GA260847X', '1236-2026', 'FCSTPO166690'],
    ['GA260848E', '1236-2026', 'FCSTPO166690'],
    ['GA260848J', '1236-2026', 'FCSTPO166690'],
    ['GA260849J', '3654-2026', '161945_AUGUST'],
    ['GA260849R', '3656-2026', '161945_SEPTEMBER'],
    ['GA260850M', '3654-2026', '161945_AUGUST'],
    ['GA261276Z', '1443-2026', 'FCSTPO167923'],
    ['GA261277A', '1443-2026', 'FCSTPO167923'],
    ['GA261277G', '1443-2026', 'FCSTPO167923'],
  ].map(([code, dmgOrder, poMad]) => ({ code, dmgOrder, poMad, po: (poMad.match(/\d{6}/) || [poMad])[0] }));

  const BY_CODE = new Map(BAD_PARTS.map((p) => [p.code, p]));

  // The purchase orders that contain bad parts, in the order they first appear in the list.
  const POS = [];
  BAD_PARTS.forEach((p) => {
    let po = POS.find((x) => x.po === p.po);
    if (!po) POS.push(po = { po: p.po, poMads: [], dmgOrders: [], parts: [] });
    if (!po.poMads.includes(p.poMad)) po.poMads.push(p.poMad);
    if (!po.dmgOrders.includes(p.dmgOrder)) po.dmgOrders.push(p.dmgOrder);
    po.parts.push(p);
  });

  const CODE_RE = /[GN]A[0-9A-Z]{5,12}/;

  // Read a part QR code such as "https://mydmg.dmg.it/it/qr/?mat=16080625$$GA2604429", or a typed
  // code such as "ga260846l". Returns { code, mat } or null if no GA/NA code is in it.
  function readPartCode(text) {
    let t = String(text || '').trim();
    try { t = decodeURIComponent(t); } catch (e) { /* keep as is */ }
    t = t.toUpperCase();
    const mat = (t.match(/MAT=(\d+)/) || [])[1] || '';
    // The serial comes after "$$" in the QR link.
    const i = t.lastIndexOf('$$');
    const tail = i >= 0 ? t.slice(i + 2) : t;
    const m = tail.replace(/\s+/g, '').match(CODE_RE) || t.match(new RegExp('(?:^|[^A-Z0-9])(' + CODE_RE.source + ')(?![A-Z0-9])'));
    if (!m) return null;
    return { code: m[1] || m[0], mat };
  }

  // The bad-part entry for a code, or null when the part is not one of the bad ones.
  function findBad(code) {
    return BY_CODE.get(String(code || '').toUpperCase().trim()) || null;
  }

  const api = { BAD_PARTS, POS, readPartCode, findBad };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Parts = api;
})(typeof window !== 'undefined' ? window : this);
