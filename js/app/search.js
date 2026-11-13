/* cyex paints: library search. Ranks layers, effects and My library items by how well they match:
   name over tags over category over description, whole words over word starts over typos (one or two
   letters off), and each word also matches its synonyms (js/tags.js). similar() ranks by shared tags. */
(function (PL) {
  'use strict';
  const A = (PL.App = PL.App || {});
  const words = (s) => String(s || '').toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9-]+/).filter(Boolean);

  // synonym groups: word -> every word in its groups
  let synMap = null;
  const syn = (w) => {
    if (!synMap) {
      synMap = new Map();
      for (const g of PL.SEARCH_SYNONYMS || []) for (const x of g) { const s = synMap.get(x) || new Set(); g.forEach((y) => s.add(y)); synMap.set(x, s); }
    }
    return synMap.get(w);
  };
  // Edit distance where a swapped pair of letters counts as one edit ("chorme" is one away from
  // "chrome"); stops early once it is over max.
  function dist(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev2 = null, prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i]; let best = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
        best = Math.min(best, cur[j]);
      }
      if (best > max) return max + 1;
      prev2 = prev; prev = cur;
    }
    return prev[b.length];
  }
  // How well one query word matches a list of words, 0..1
  function wordScore(q, list) {
    let best = 0;
    const s = syn(q);
    for (const w of list) {
      if (w === q) return 1;
      if (w.startsWith(q) && q.length >= 2) best = Math.max(best, 0.85);
      else if (s && s.has(w)) best = Math.max(best, 0.7);
      else if (q.length >= 4 && w.length >= 4) {
        const d = dist(q, w.slice(0, q.length + 1), q.length >= 7 ? 2 : 1); // also catches a typo in a word start
        if (d <= (q.length >= 7 ? 2 : 1)) best = Math.max(best, 0.6);
        else if (w.includes(q)) best = Math.max(best, 0.5);
      }
    }
    return best;
  }
  // An entry is { key, kind, name, cat, desc, tags, ref }. Fields are prepared once.
  const prep = (e) => (e._w ? e : Object.assign(e, { _w: { name: words(e.name), tags: (e.tags || []).flatMap(words), cat: words(e.cat), desc: words(e.desc) } }));
  const FIELDS = [['name', 6], ['tags', 4], ['cat', 2.5], ['desc', 1]];
  function score(e, qs) {
    prep(e);
    let total = 0, hit = 0;
    for (const q of qs) {
      let best = 0;
      for (const [f, wgt] of FIELDS) { const s = wordScore(q, e._w[f]); if (s) best = Math.max(best, s * wgt); }
      if (best) hit++;
      total += best;
    }
    if (!hit) return 0;
    if (hit < qs.length) total *= 0.6 * (hit / qs.length); // items matching every word come first; partial matches follow
    if (words(e.name).join(' ').startsWith(qs.join(' '))) total += 3; // the name starts with what was typed
    return total;
  }
  // Best matches first. Entries scoring under a sixth of the best are dropped as noise.
  function search(entries, query) {
    const qs = words(query).slice(0, 8);
    if (!qs.length) return entries.slice();
    const scored = entries.map((e) => [score(e, qs), e]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]);
    const top = scored.length ? scored[0][0] : 0;
    return scored.filter(([s]) => s >= top / 6).map(([, e]) => e);
  }
  // Entries that look like e: shared tags (and their synonyms), the same category, shared name words.
  function similar(entries, e, limit = 24) {
    prep(e);
    const tags = new Set(e._w.tags), syns = new Set();
    for (const t of tags) for (const s of syn(t) || []) syns.add(s);
    const out = [];
    for (const x of entries) {
      if (x === e || x.key === e.key) continue;
      prep(x);
      let s = 0;
      for (const t of new Set(x._w.tags)) s += tags.has(t) ? 1 : syns.has(t) ? 0.5 : 0;
      s /= Math.sqrt((tags.size || 1) * (new Set(x._w.tags).size || 1));
      if (x.cat === e.cat) s += 0.25;
      for (const w of x._w.name) if (e._w.name.includes(w)) s += 0.15;
      if (s > 0.12) out.push([s, x]);
    }
    return out.sort((a, b) => b[0] - a[0]).slice(0, limit).map(([, x]) => x);
  }
  A.Search = { search, similar, words };
})(window.PL);
