/* cyex paints: "My paints", a library of saved paints kept in this browser (localStorage).
   Loads after store.js and before main.js. Registers A.openMyPaints, A.saveCurrent, A.ico. */
(function (PL) {
  'use strict';
  const { h, icon, dialog, toast } = PL.UI;
  const E = PL.Engine, Paint = PL.Paint, clone = PL.clone;
  const A = (PL.App = PL.App || {});

  // =====================================================================================
  // Icons the shared set doesn't have (same attributes as PL.UI.icon)
  // =====================================================================================
  const EXTRA_ICONS = {
    pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/><path d="m15 5 4 4"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  };
  function ico(name) {
    if (!EXTRA_ICONS[name]) return icon(name);
    const s = icon('x');
    s.innerHTML = EXTRA_ICONS[name];
    return s;
  }
  const iconAction = (name, label, onclick, cls) => h('button', { type: 'button', class: 'icon-btn sm' + (cls ? ' ' + cls : ''), 'aria-label': label, 'data-tip': label, onclick }, ico(name));

  // =====================================================================================
  // Storage: one JSON array under one key, newest first. Every access is guarded: the page
  // also runs where storage throws, and then the library is shown as unavailable.
  // =====================================================================================
  const LIB_KEY = 'cyexPaints.library';
  const UNAVAILABLE = 'This browser is blocking storage here, so My paints isn’t available. Use Save project or Copy JSON to keep a paint.';
  const FULL = 'Browser storage is full. Delete some saved paints and try again.';
  const NAME_MAX = 60;

  // { ok: false } when storage can't be read; otherwise { ok: true, items }
  function readLib() {
    let raw;
    try { raw = localStorage.getItem(LIB_KEY); } catch (_) { return { ok: false, items: [] }; }
    if (raw == null || raw === '') return { ok: true, items: [] };
    try {
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) throw new Error('not a list');
      const items = arr.filter((e) => e && typeof e.id === 'string' && (e.mode === 'static' || e.mode === 'anim') && e.data && typeof e.data === 'object')
        .map((e) => Object.assign({}, e, { name: String(e.name || '').trim() || 'Untitled paint' }));
      return { ok: true, items };
    } catch (_) {
      // unreadable library: keep a copy before anything can overwrite it
      try { localStorage.setItem(LIB_KEY + '.broken', raw); } catch (__) {}
      return { ok: true, items: [] };
    }
  }
  function writeLib(items) {
    try { localStorage.setItem(LIB_KEY, JSON.stringify(items)); return true; } catch (_) { return false; }
  }

  // =====================================================================================
  // Thumbnails: 160 x 40 PNG data URL. Static paints use Paint.rasterize; animated ones render one frame.
  // =====================================================================================
  function makeThumb() {
    const W = 160, H = 40;
    try {
      let img;
      if (A.state.mode === 'anim') {
        const doc = Object.assign({}, A.state.anim, { width: W, height: H });
        img = E.renderFrame(E.compile(doc), Math.floor(E.frameCount(doc) * 0.3), W, H);
      } else img = Paint.rasterize(A.state.static, W, H);
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      cv.getContext('2d').putImageData(img, 0, 0);
      return cv.toDataURL('image/png');
    } catch (_) { return ''; }
  }

  // =====================================================================================
  // Operations
  // =====================================================================================
  let originId = null; // the entry the open paint came from (or was last saved as)
  let refresh = null;  // re-renders the dialog's list while it is open
  const newId = () => 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const q = (t) => '“' + t + '”';
  const entryName = () => {
    const p = A.state.mode === 'anim' ? A.state.anim : A.state.static;
    return String((p && p.name) || '').trim().slice(0, NAME_MAX) || 'Untitled paint';
  };
  // The link only holds while the same paint is open: loading a preset, import or surprise replaces the paint
  // object, so it no longer counts as that entry (undo keeps it when the name still matches).
  let originRef = null;
  const stillSame = (e) => { const cur = A.state[A.state.mode]; return cur === originRef || (cur && e && cur.name === e.name); };
  const originEntry = (items) => { const e = originId ? items.find((x) => x.id === originId && x.mode === A.state.mode) : null; return e && stillSame(e) ? e : null; };
  const stripPictures = (data) => { const c = clone(data); (c.layers || []).forEach((l) => { if (l.params && l.params.src) l.params.src = ''; }); return c; };

  // Saves the open paint. asNew=true always creates an entry; otherwise it replaces the entry it came from, if any.
  function saveCurrent(asNew) {
    const lib = readLib();
    if (!lib.ok) { toast(UNAVAILABLE, 'error'); return null; }
    const mode = A.state.mode, name = entryName();
    const src = originEntry(lib.items);
    const overwrite = !asNew && src ? src : null;
    const build = (data) => {
      const entry = { id: overwrite ? overwrite.id : newId(), name, mode, savedAt: new Date().toISOString(), thumb: makeThumb(), data };
      if (data && typeof data === 'object') data.name = name;
      return overwrite ? lib.items.map((e) => (e.id === overwrite.id ? entry : e)) : [entry].concat(lib.items);
    };
    const live = mode === 'anim' ? A.state.anim : A.state.static;
    let stripped = false, list = build(Object.assign({}, live));
    if (!writeLib(list)) {
      if (mode === 'anim') { stripped = true; list = build(stripPictures(live)); }
      if (!stripped || !writeLib(list)) { toast(FULL, 'error'); return null; }
    }
    originId = overwrite ? overwrite.id : list[0].id; originRef = A.state[A.state.mode];
    toast(stripped
      ? `Saved ${q(name)} without its pictures because browser storage is nearly full. Layers that used pictures will be empty when opened.`
      : overwrite ? `Updated ${q(name)} in My paints.` : `Saved ${q(name)} to My paints.`, stripped ? 'info' : 'success');
    if (refresh) refresh();
    return list.find((e) => e.id === originId);
  }

  function openEntry(entry, close) {
    try {
      const msg = entry.mode === 'anim' ? A.loadJson({ cyexPaintProject: 1, doc: clone(entry.data) }) : A.loadJson(clone(entry.data));
      originId = entry.id; setTimeout(() => { originRef = A.state[A.state.mode]; });
      if (close) close();
      A.renderAll(); A.commit(`Opened ${short(entry.name)}`);
      toast(`Opened ${q(entry.name)}.`, 'success');
      return msg;
    } catch (e) {
      toast('Couldn’t open that paint. Its saved data may be damaged.', 'error');
      return null;
    }
  }
  const short = (t) => (t.length > 28 ? t.slice(0, 27) + '…' : t);

  function updateEntry(id, fn) {
    const lib = readLib();
    if (!lib.ok) { toast(UNAVAILABLE, 'error'); return false; }
    const next = lib.items.map((e) => (e.id === id ? fn(e) : e));
    if (!writeLib(next)) { toast(FULL, 'error'); return false; }
    return true;
  }
  function renameEntry(entry, value) {
    const name = value.trim().slice(0, NAME_MAX);
    if (!name || name === entry.name) return false;
    return updateEntry(entry.id, (e) => Object.assign({}, e, { name, data: Object.assign({}, e.data, { name }) }));
  }
  function duplicateEntry(entry) {
    const lib = readLib();
    if (!lib.ok) { toast(UNAVAILABLE, 'error'); return; }
    const name = (entry.name + ' copy').slice(0, NAME_MAX);
    const copy = Object.assign({}, entry, { id: newId(), name, savedAt: new Date().toISOString(), data: Object.assign({}, entry.data, { name }) });
    if (!writeLib([copy].concat(lib.items))) { toast(FULL, 'error'); return; }
    toast(`Duplicated as ${q(name)}.`, 'success');
  }
  function deleteEntry(entry) {
    const lib = readLib();
    if (!lib.ok) { toast(UNAVAILABLE, 'error'); return; }
    if (!writeLib(lib.items.filter((e) => e.id !== entry.id))) { toast(FULL, 'error'); return; }
    if (originId === entry.id) originId = null;
    toast(`Deleted ${q(entry.name)}.`, 'success');
  }

  // =====================================================================================
  // Dialog
  // =====================================================================================
  function relative(iso) {
    const d = new Date(iso), ms = Date.now() - d.getTime();
    if (isNaN(d)) return '';
    if (ms < 0 || ms >= 864e5) return A.fmtDate(d);
    const min = Math.floor(ms / 6e4);
    if (min < 1) return 'Just now';
    if (min < 60) return `${min} min ago`;
    return `${Math.floor(min / 60)} h ago`;
  }

  let dlgOpen = null;
  function openMyPaints() {
    if (dlgOpen) { dlgOpen.focusFirst(); return; }
    const lib0 = readLib();
    if (!lib0.ok) {
      dlgOpen = dialog('My paints', h('div', { class: 'empty' }, icon('folder'), h('span', null, UNAVAILABLE)), { wide: true, onClose: () => { dlgOpen = null; } });
      return;
    }
    const search = h('input', { class: 'field', placeholder: 'Search…', 'aria-label': 'Search saved paints', autofocus: true });
    const saveB = h('button', { type: 'button', class: 'btn primary', onclick: () => saveCurrent(false) }, icon('save'), 'Save current paint');
    const newB = h('button', { type: 'button', class: 'btn secondary', onclick: () => saveCurrent(true) }, icon('plus'), 'Save as new');
    const info = h('p', { class: 'hint mp-info' });
    const grid = h('ul', { class: 'mp-grid', 'aria-label': 'Saved paints' });
    const foot = h('p', { class: 'hint' }, 'Paints are kept in this browser only. Clearing site data removes them, so export what you can’t lose.');
    const body = h('div', { class: 'mp' }, h('div', { class: 'mp-bar' }, h('div', { class: 'search' }, icon('search'), search), newB, saveB), info, grid, foot);

    const render = () => {
      const lib = readLib();
      if (!lib.ok) { grid.textContent = ''; grid.append(h('li', { class: 'empty' }, icon('folder'), h('span', null, UNAVAILABLE))); return; }
      const from = originEntry(lib.items);
      newB.hidden = !from;
      info.textContent = from ? `Opened from ${q(from.name)}. Save current paint replaces it; Save as new keeps both.` : 'Save current paint adds the open paint as a new entry.';
      const qy = search.value.trim().toLowerCase();
      const items = lib.items.slice().sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)))
        .filter((e) => !qy || (e.name + ' ' + (e.mode === 'anim' ? 'animated' : 'static')).toLowerCase().includes(qy));
      grid.textContent = '';
      if (!items.length) {
        grid.append(h('li', { class: 'empty mp-empty' }, icon(qy ? 'search' : 'folder'), h('span', null, qy ? 'Nothing matches that search.' : 'No saved paints yet. Save the open paint to keep it in this browser.')));
        return;
      }
      items.forEach((e) => grid.append(card(e)));
    };
    refresh = render;
    search.addEventListener('input', render);

    function card(e) {
      const nameEl = h('b', { class: 'mp-name', title: e.name }, e.name);
      const nameRow = h('div', { class: 'mp-namerow' }, nameEl, h('span', { class: 'mp-chip' }, e.mode === 'anim' ? 'Animated' : 'Static'));
      const thumb = e.thumb
        ? h('img', { class: 'mp-thumb', src: e.thumb, alt: '', width: 160, height: 40, decoding: 'async', onclick: () => openEntry(e, dlg.close) })
        : h('div', { class: 'mp-thumb', 'aria-hidden': 'true' });
      const date = h('time', { class: 'mp-date', datetime: e.savedAt, title: A.fmtDate(e.savedAt) }, relative(e.savedAt));

      const startRename = () => {
        const input = h('input', { class: 'field mp-rename', value: e.name, maxlength: NAME_MAX, 'aria-label': 'Paint name' });
        nameRow.replaceChild(input, nameEl);
        input.focus(); input.select();
        let done = false;
        // in place, without redrawing the list, so a click on another card still lands
        const finish = (commit, refocus) => {
          if (done) return; done = true;
          const value = input.value.trim().slice(0, NAME_MAX);
          if (commit && value && value !== e.name && renameEntry(e, value)) { e.name = value; relabel(); }
          nameEl.textContent = e.name; nameEl.title = e.name;
          if (input.parentNode === nameRow) nameRow.replaceChild(nameEl, input);
          if (refocus) renB.focus();
        };
        input.addEventListener('blur', () => finish(true, false));
        input.mpFinish = finish;
      };
      const openB = h('button', { type: 'button', class: 'btn secondary small', onclick: () => openEntry(e, dlg.close) }, icon('folder'), 'Open');
      const renB = iconAction('pencil', `Rename ${e.name}`, startRename, 'mp-rename-btn');
      const dupB = iconAction('copy', `Duplicate ${e.name}`, () => { duplicateEntry(e); render(); (grid.querySelector('.mp-card .btn') || search).focus(); });
      // arm, then confirm: the first click turns the button into "Click again to delete" for 3 s
      let armTimer = 0;
      const delB = iconAction('trash', `Delete ${e.name}`, () => {
        if (!delB.classList.contains('armed')) {
          delB.classList.add('armed');
          delB.textContent = 'Click again to delete';
          delB.setAttribute('aria-label', `Click again to delete ${e.name}`); delB.removeAttribute('data-tip');
          armTimer = setTimeout(disarm, 3000);
          return;
        }
        clearTimeout(armTimer);
        deleteEntry(e); render();
        (grid.querySelector('.mp-card .btn') || search).focus();
      }, 'danger mp-del');
      function relabel() {
        renB.setAttribute('aria-label', `Rename ${e.name}`); renB.setAttribute('data-tip', `Rename ${e.name}`);
        dupB.setAttribute('aria-label', `Duplicate ${e.name}`); dupB.setAttribute('data-tip', `Duplicate ${e.name}`);
        if (!delB.classList.contains('armed')) { delB.setAttribute('aria-label', `Delete ${e.name}`); delB.setAttribute('data-tip', `Delete ${e.name}`); }
      }
      function disarm() {
        clearTimeout(armTimer);
        if (!delB.isConnected) return;
        delB.classList.remove('armed');
        delB.textContent = ''; delB.append(ico('trash'));
        delB.setAttribute('aria-label', `Delete ${e.name}`); delB.setAttribute('data-tip', `Delete ${e.name}`);
      }
      delB.addEventListener('blur', () => { if (delB.classList.contains('armed')) disarm(); });

      return h('li', { class: 'mp-card' + (e.id === originId ? ' current' : ''), 'data-id': e.id }, thumb, nameRow, date, h('div', { class: 'mp-actions' }, openB, h('span', { class: 'mp-tools' }, renB, dupB, delB)));
    }

    // Inline rename needs Enter and Escape for itself: the dialog's own capture handler would otherwise
    // run Escape (close) first, so this one sits on window, which captures earlier.
    const keys = (ev) => {
      const t = ev.target;
      if (!t || !t.classList || !t.classList.contains('mp-rename')) return;
      if (ev.key === 'Enter' || ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); t.mpFinish && t.mpFinish(ev.key === 'Enter', true); }
    };
    window.addEventListener('keydown', keys, true);
    const dlg = dialog('My paints', body, { wide: true, onClose: () => { window.removeEventListener('keydown', keys, true); refresh = null; dlgOpen = null; } });
    dlgOpen = dlg;
    render();
  }

  Object.assign(A, { openMyPaints, saveCurrent, ico });
})(window.PL);
