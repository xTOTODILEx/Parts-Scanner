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
    'PMATIS07C.50',
    'PMATIS07C.501',
    'PMATIS07L.50',
    'PMATIS07L.501',
    'PMATIS10C.50',
    'PMATIS10C.501',
    'PMATIS10L.50',
    'PMATIS10L.501',
    'PMATIS10S.50',
    'PMATIS10S.501',
  ];

  // Family name used to colour the buttons, e.g. "PGIOTT07C" -> "GIOTT".
  function family(part) {
    const m = String(part).match(/^P([A-Z]+?)\d/);
    return m ? m[1] : '';
  }

  // state: { counts: { part: n }, log: [{ part, delta }] }. The log lets the last change be undone.
  function emptyState() {
    return { counts: {}, log: [] };
  }

  // Add delta (+1 or -1) to a part. Counts never go below 0; a -1 at 0 changes nothing.
  // Returns true if the count changed.
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

  function total(state) {
    return PARTS.reduce((sum, p) => sum + (state.counts[p] || 0), 0);
  }

  const api = { PARTS, family, emptyState, change, undo, total };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Inventory = api;
})(typeof window !== 'undefined' ? window : this);
