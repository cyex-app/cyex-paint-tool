/* cyex paints: app state, persistence (localStorage), undo history and changed(). */
(function (PL) {
  'use strict';
  const { toast } = PL.UI;
  const E = PL.Engine, Paint = PL.Paint, clone = PL.clone;
  const A = (PL.App = PL.App || {});

  PL.imageCache = {};

  // =====================================================================================
  // State, persistence, history
  // =====================================================================================
  const KEY = 'cyexPaints.v1';
  const defaultState = () => ({
    mode: 'static',
    static: clone(PL.STATIC_PRESETS[0]),
    anim: PL.ANIM_PRESETS[PL.SCENE_COUNT](),
    preview: { text: 'lumen_fox', color: '#ff7f50', bg: 'dark' },
    sel: null,
    gif: { colors: 256, dither: false, alpha: true },
    url: '',
    nameSize: 48,
    texSize: [256, 64],
  });
  // Anything loaded (saved state, imports, dropped files) goes through sanitizeDoc, which clamps
  // every value to what the editor can make and drops unknown layer types (reported to the user).
  A.pendingNotice = null;
  function healDoc(doc, quiet) {
    const { doc: d, dropped } = E.sanitizeDoc(doc);
    if (dropped && !quiet) toastLater(`Skipped ${dropped} layer${dropped > 1 ? 's' : ''} this version doesn't know.`);
    return d;
  }
  function toastLater(msg, kind = 'info') { if (typeof toast === 'function' && document.getElementById('toasts')) toast(msg, kind); else A.pendingNotice = [msg, kind]; }
  A.state = defaultState();
  try {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (_) { raw = null; } // storage blocked: nothing saved, not broken
    const saved = JSON.parse(raw || 'null');
    if (saved && saved.static && saved.anim) {
      const next = Object.assign(defaultState(), saved);
      next.anim = healDoc(next.anim, true);
      next.static = Paint.normalize(next.static);
      E.compile(next.anim); // throws here, not on every frame, if something is still wrong
      A.state = next;
    }
  } catch (e) {
    // a broken saved state must not brick the app: keep a copy and start fresh
    try { localStorage.setItem(KEY + '.broken', localStorage.getItem(KEY) || ''); } catch (_) {}
    A.state = defaultState();
    A.pendingNotice = ['Your last saved paint couldn’t be loaded, so a fresh one is open. A copy was kept in this browser.', 'error'];
  }
  A.state.anim = healDoc(A.state.anim, true);
  A.state.static = Paint.normalize(A.state.static);

  // One place that opens any JSON: a 7TV paint, or a cyex paints project.
  function loadJson(obj) {
    if (obj && obj.cyexPaintProject) {
      A.state.anim = healDoc(obj.doc); A.state.mode = 'anim'; A.state.sel = null;
      A.cacheDocImages(A.state.anim);
      return 'Project opened.';
    }
    const res = Paint.normalize(obj, true);
    A.state.static = res.paint; A.state.mode = 'static';
    // corrections get their own neutral toast (it stays up longer for longer text), not the success one
    if (res.warnings.length) setTimeout(() => PL.UI.toast('Some values were corrected: ' + res.warnings.join(' ')));
    return 'Paint imported.';
  }

  let saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(A.state)); }
      catch (e) { // images can blow the quota; save without them
        try { const s = clone(A.state); s.anim.layers.forEach((l) => { if (l.params && l.params.src) l.params.src = ''; }); localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {}
      }
    }, 300);
  }

  // Undo snapshots keep pictures out: each data URL is stored once in a side table and the
  // snapshot holds a short token, so 120 history steps don't hold 120 copies of every image.
  const imgToken = new Map(), tokenImg = new Map();
  const tokenFor = (src) => { let t = imgToken.get(src); if (!t) { t = '@img' + imgToken.size; imgToken.set(src, t); tokenImg.set(t, src); } return t; };
  const snap = () => JSON.stringify({ mode: A.state.mode, static: A.state.static, anim: A.state.anim }, (k, v) => (k === 'src' && typeof v === 'string' && v.startsWith('data:') ? tokenFor(v) : v));
  // Each history entry is { s: snapshot string, label, time }: the label says what produced that state.
  const hist = { past: [], future: [], last: { s: snap(), label: 'Start of session', time: Date.now() } };
  let commitTimer = 0;

  // Short, cheap label for a commit: compare the old and new snapshot's top-level keys, then the layer/effect lists.
  const short = (t) => { t = String(t == null ? '' : t).trim() || 'Unnamed'; return t.length > 28 ? t.slice(0, 27) + '…' : t; };
  const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  function listChange(a, b, noun) {
    a = Array.isArray(a) ? a : []; b = Array.isArray(b) ? b : [];
    const ai = new Map(a.map((x) => [x.id, x])), bi = new Map(b.map((x) => [x.id, x]));
    const added = b.filter((x) => !ai.has(x.id)), removed = a.filter((x) => !bi.has(x.id));
    if (added.length && removed.length) return `Replaced ${noun}s`;
    if (added.length) return added.length === 1 ? `Added ${short(added[0].name || noun)}` : `Added ${added.length} ${noun}s`;
    if (removed.length) return removed.length === 1 ? `Removed ${short(removed[0].name || noun)}` : `Removed ${removed.length} ${noun}s`;
    if (a.some((x, i) => x.id !== b[i].id)) return `Reordered ${noun}s`;
    const changed = b.filter((x) => !same(x, ai.get(x.id)));
    if (!changed.length) return null;
    if (changed.length > 1) return `Edited ${changed.length} ${noun}s`;
    const x = changed[0], o = ai.get(x.id);
    if (o.name !== x.name) return `Renamed ${short(o.name)} to ${short(x.name)}`;
    if (o.visible !== x.visible && same(Object.assign({}, o, { visible: x.visible }), x)) return `${x.visible === false ? 'Hid' : 'Showed'} ${short(x.name)}`;
    return `Edited ${short(x.name || noun)}`;
  }
  const KEY_LABELS = {
    name: 'Renamed paint', width: 'Changed paint size', height: 'Changed paint size', fps: 'Changed timing', duration: 'Changed timing',
    shadows: 'Changed shadows', tweak: 'Changed colour tweaks', groups: 'Changed layer groups', stops: 'Changed gradient stops',
    angle: 'Changed gradient angle', function: 'Changed gradient type', repeat: 'Changed repeat', shape: 'Changed gradient shape',
  };
  function keysLabel(x, y, skip) {
    x = x || {}; y = y || {};
    const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((k) => !(skip && skip.includes(k)) && !same(x[k], y[k]));
    if (!keys.length) return null;
    if (keys.length >= 4) return 'Replaced paint';
    const labels = new Set(keys.map((k) => KEY_LABELS[k] || 'Changed paint settings'));
    return labels.size === 1 ? [...labels][0] : 'Changed paint settings';
  }
  function describe(prevS, nextS) {
    try {
      const a = JSON.parse(prevS), b = JSON.parse(nextS);
      if (a.mode !== b.mode) return b.mode === 'anim' ? 'Switched to animated' : 'Switched to static';
      if (b.mode === 'anim') {
        const x = a.anim || {}, y = b.anim || {};
        const parts = [listChange(x.layers, y.layers, 'layer'), listChange(x.effects, y.effects, 'effect'), keysLabel(x, y, ['layers', 'effects'])].filter(Boolean);
        if (parts.length === 1) return parts[0];
        if (parts.length > 1) return 'Changed several things';
      } else {
        const l = keysLabel(a.static, b.static);
        if (l) return l;
      }
    } catch (_) { /* fall through */ }
    return 'Edited paint';
  }

  // commit(label?): a string label overrides the derived one (e.g. 'Opened "x"'); anything else (event objects) is ignored.
  function commit(label) {
    clearTimeout(commitTimer);
    const s = snap();
    if (s === hist.last.s) return;
    hist.past.push(hist.last); if (hist.past.length > 120) hist.past.shift();
    hist.future = [];
    hist.last = { s, label: typeof label === 'string' && label ? label : describe(hist.last.s, s), time: Date.now() };
    updateUndo(); save();
  }
  function restore(entry) {
    const o = JSON.parse(entry.s, (k, v) => (k === 'src' && typeof v === 'string' && tokenImg.has(v) ? tokenImg.get(v) : v));
    A.state.mode = o.mode; A.state.static = o.static; A.state.anim = o.anim;
    hist.last = entry;
    A.renderAll(); save(); updateUndo();
  }
  const undo = () => { if (!hist.past.length) return; commit(); if (!hist.past.length) return; hist.future.push(hist.last); restore(hist.past.pop()); };
  const redo = () => { commit(); if (!hist.future.length) return; hist.past.push(hist.last); restore(hist.future.pop()); };
  // Oldest first: past, the current state, then the redo stack (its top is the next newer step).
  const timeline = () => hist.past.concat([hist.last], hist.future.slice().reverse());
  // Newest first, for the History list. index is the position in oldest-first order, which jumpTo takes.
  function history() {
    commit();
    const T = timeline(), cur = hist.past.length;
    return T.map((e, i) => ({ label: e.label, time: e.time, index: i, current: i === cur })).reverse();
  }
  // Restore any step; steps after it stay available for redo.
  function jumpTo(index) {
    commit();
    const T = timeline(), q = Math.floor(index);
    if (!(q >= 0 && q < T.length) || q === hist.past.length) return false;
    hist.past = T.slice(0, q); hist.future = T.slice(q + 1).reverse();
    restore(T[q]);
    return true;
  }
  function updateUndo() {
    const u = $('#undoBtn'), r = $('#redoBtn'), had = document.activeElement;
    u.disabled = !hist.past.length; r.disabled = !hist.future.length;
    // a button that just disabled itself would drop focus to the page: hand it to its partner
    if (had === u && u.disabled) (r.disabled ? $('#presetsBtn') : r).focus();
    else if (had === r && r.disabled) (u.disabled ? $('#presetsBtn') : u).focus();
  }

  // Every edit calls changed(); commit=true for discrete actions, sliders commit on release.
  function changed(doCommit) {
    if (A.state.mode === 'anim') { A.rt.dirty = true; A.scheduleThumbs(); }
    else A.updateStaticPreview();
    A.updateOutput();
    save();
    clearTimeout(commitTimer);
    if (doCommit) commit(); else commitTimer = setTimeout(commit, 700);
  }

  const $ = (s, r = document) => r.querySelector(s);

  // cyex formats: 2026/11/13 14:02 and 14:02:31 (local time)
  const p2 = (n) => String(n).padStart(2, '0');
  const toDate = (v) => (v instanceof Date ? v : new Date(v));
  const fmtDate = (v) => { const d = toDate(v); return isNaN(d) ? '' : `${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`; };
  const fmtTime = (v) => { const d = toDate(v); return isNaN(d) ? '' : `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`; };

  Object.assign(A, { loadJson, save, commit, undo, redo, history, jumpTo, updateUndo, changed, fmtDate, fmtTime, $ });
})(window.PL);
