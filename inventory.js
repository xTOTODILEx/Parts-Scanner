// Inventory counter: the list of part numbers, and adding/removing counts.
// Separate from the bad part finder. Works in the browser (window.Inventory) and in Node (tests).
(function (root) {
  'use strict';

  // Part numbers shown as buttons, in this order. To change the list, edit these lines.
  const PARTS = [
    'PGIOTT07C',
    'PGIOTT04C',
    'PGIOTT04L',
    'PGIOTT04S',
    'PGIOTT07S',
    'PGIOTT07L',
    'PRAFF02SC.50',
    'PRAFF02C.00',
    'PRAFF02S.00',
    'PRAFF04C.50',
    'PRAFF04C.00',
    'PRAFF04S.00',
    'PMATIS00C.50',
    'PMATIS00C.501',
    'PMATIS00S.50',
    'PMATIS00S.501',
    'PMATIS07C.50',
    'PMATIS07C.501',
    'PMATIS07L.50',
    'PMATIS07L.501',
    'PMATIS07S.50',
    'PMATIS07S.501',
    'PMATIS10C.50',
    'PMATIS10C.501',
    'PMATIS10L.50',
    'PMATIS10L.501',
    'PMATIS10S.50',
    'PMATIS10S.501',
    'PMATIS15C.50',
    'PMATIS15S.50',
    'E.PMATIS00C.501',
    'E.PMATIS00S.501',
    'E.PMATIS10C.50',
    'E.PMATIS10C.501',
    'E.PMATIS15C.50',
  ];

  // The buttons are shown in these categories, by the start of the part number.
  const CATEGORIES = [
    { name: 'GIOTTOS', prefix: 'PGIOT', key: 'GIOTT' },
    { name: 'RAFFAELLOS', prefix: 'PRAFF', key: 'RAFF' },
    { name: 'MATISSES', prefix: 'PMATIS', key: 'MATIS' },
    { name: 'ECS PARTS', prefix: 'E.', key: 'ECS' },
  ];

  // The category a part belongs to, e.g. "PGIOTT07C" -> GIOTTOS. Unknown prefixes go in "OTHER".
  function category(part) {
    return CATEGORIES.find((c) => String(part).startsWith(c.prefix)) || { name: 'OTHER', prefix: '', key: 'OTHER' };
  }

  // Family key used to colour the buttons, e.g. "PGIOTT07C" -> "GIOTT".
  function family(part) {
    return category(part).key;
  }

  // The categories with their parts, in list order; categories with no parts are left out.
  function groups() {
    const out = [];
    PARTS.forEach((p) => {
      const c = category(p);
      let g = out.find((x) => x.name === c.name);
      if (!g) out.push(g = { name: c.name, key: c.key, parts: [] });
      g.parts.push(p);
    });
    const order = CATEGORIES.map((c) => c.name);
    return out.sort((a, b) => (order.indexOf(a.name) + 1 || 99) - (order.indexOf(b.name) + 1 || 99));
  }

  // state: { counts: { part: n }, log: [{ part, delta }] }. The log lets the last change be undone.
  function emptyState() {
    return { counts: {}, log: [] };
  }

  // Add delta to a part (+1 per tap, or a typed amount such as +60; negative to remove).
  // Counts never go below 0; removing from 0 changes nothing. Returns true if the count changed.
  function change(state, part, delta) {
    const now = state.counts[part] || 0;
    const next = Math.max(0, now + delta);
    if (next === now) return false;
    state.counts[part] = next;
    state.log.push({ part, delta: next - now });
    if (state.log.length > 500) state.log.shift();
    return true;
  }

  // Undo the last change. Returns the undone { part, delta } or null if there is nothing to undo.
  function undo(state) {
    const last = state.log.pop();
    if (!last) return null;
    state.counts[last.part] = Math.max(0, (state.counts[last.part] || 0) - last.delta);
    return last;
  }

  function total(state, parts) {
    return (parts || PARTS).reduce((sum, p) => sum + (state.counts[p] || 0), 0);
  }

  // Add several counts together, e.g. Overstock + Stockroom. The result has no undo log.
  function combine(...states) {
    const counts = {};
    states.forEach((st) => Object.keys(st.counts).forEach((p) => { counts[p] = (counts[p] || 0) + (st.counts[p] || 0); }));
    return { counts, log: [] };
  }

  // A typed amount as a whole number from 1 to 99999; anything else (empty, 0, letters) counts as 1.
  function amount(text) {
    const n = Math.floor(Number(String(text == null ? '' : text).trim()));
    return Number.isFinite(n) && n >= 1 ? Math.min(n, 99999) : 1;
  }

  const api = { PARTS, CATEGORIES, category, family, groups, emptyState, change, undo, total, combine, amount };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Inventory = api;
})(typeof window !== 'undefined' ? window : this);
