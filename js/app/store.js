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
    return res.warnings.length ? 'Paint imported. ' + res.warnings.join(' ') : 'Paint imported.';
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
  const hist = { past: [], future: [], last: snap() };
  let commitTimer = 0;
  function commit() {
    clearTimeout(commitTimer);
    const s = snap();
    if (s === hist.last) return;
    hist.past.push(hist.last); if (hist.past.length > 120) hist.past.shift();
    hist.future = []; hist.last = s;
    updateUndo(); save();
  }
  function restore(s) {
    const o = JSON.parse(s, (k, v) => (k === 'src' && typeof v === 'string' && tokenImg.has(v) ? tokenImg.get(v) : v));
    A.state.mode = o.mode; A.state.static = o.static; A.state.anim = o.anim;
    hist.last = s;
    A.renderAll(); save(); updateUndo();
  }
  const undo = () => { if (!hist.past.length) return; commit(); if (!hist.past.length) return; hist.future.push(hist.last); restore(hist.past.pop()); };
  const redo = () => { commit(); if (!hist.future.length) return; hist.past.push(hist.last); restore(hist.future.pop()); };
  function updateUndo() { $('#undoBtn').disabled = !hist.past.length; $('#redoBtn').disabled = !hist.future.length; }

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

  Object.assign(A, { loadJson, save, commit, undo, redo, updateUndo, changed, $ });
})(window.PL);
