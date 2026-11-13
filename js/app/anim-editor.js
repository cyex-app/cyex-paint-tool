/* cyex paints: the animated editor: layers, effects, settings panel, images and thumbnails. */
(function (PL) {
  'use strict';
  const { h, icon, iconBtn, btn, panel, slider, seg, checkbox, labeled, select, colorField, stopsEditor, paletteEditor, sortable, grip, group, toast } = PL.UI;
  const E = PL.Engine, clone = PL.clone;
  const A = (PL.App = PL.App || {});
  const $ = A.$; // store.js loads first

  // =====================================================================================
  // Keyframes
  // item.keys = { path: [{ t, v, e }] } on layers and effects; paths are 'opacity', 'xf.<k>',
  // 'params.<k>' and 'params.<k>.colors.<i>.w' (palette strengths). t is 0..1 on whole frames.
  // The playhead (A.now, A.seek, A.pause) lives in playback.js, which loads later: call at run time only.
  // =====================================================================================
  const getP = (o, path) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  const setP = (o, path, v) => { const ps = path.split('.'); let x = o; for (let i = 0; i < ps.length - 1; i++) { if (x == null) return; x = x[ps[i]]; } if (x != null) x[ps[ps.length - 1]] = v; };
  const MAX_KEYS = 32, MAX_PATHS = 40; // what sanitizeKeys keeps
  const XF_LABELS = { scale: 'Scale', rotate: 'Rotate', ox: 'Offset x', oy: 'Offset y' };
  // one limit toast per gesture (a slider drag, a typed value, a click): reset on commit and on pointerup
  let warned = false;
  const warnOnce = (msg) => { if (warned) return; warned = true; toast(msg); };
  addEventListener('pointerup', () => { warned = false; }, true);
  const KF = {
    EASES: [['ease', 'Ease'], ['linear', 'Linear'], ['hold', 'Hold'], ['in', 'Ease in'], ['out', 'Ease out']],
    frames: () => E.frameCount(A.state.anim),
    now: () => (A.now ? A.now() : { frame: 0, frames: KF.frames(), t: 0 }),
    frameOf: (t) => { const n = KF.frames(); return PL.clamp(Math.round(t * n), 0, n - 1); },
    snap: (t) => KF.frameOf(t) / KF.frames(),
    list: (item, path) => (item.keys && Array.isArray(item.keys[path]) && item.keys[path].length ? item.keys[path] : null),
    animated: (item, path) => !!KF.list(item, path),
    paths: (item) => Object.keys(item.keys || {}).filter((p) => KF.animated(item, p)),
    base: (item, path) => getP(item, path),
    setBase: (item, path, v) => setP(item, path, v),
    // the value shown at moment t (default: the playhead)
    value(item, path, t) { const ks = KF.list(item, path); return ks ? E.keyValue(ks, t ?? KF.now().t) : getP(item, path); },
    at(item, path, t) { const ks = KF.list(item, path); if (!ks) return null; const f = KF.frameOf(t); return ks.find((k) => KF.frameOf(k.t) === f) || null; },
    // why a key can't be added at t (default: the playhead), or '' when it can (an existing key can always change)
    limit(item, path, t) {
      if (KF.at(item, path, t ?? KF.now().t)) return '';
      const ks = KF.list(item, path) || [];
      if (ks.length >= MAX_KEYS) return `A value can have up to ${MAX_KEYS} keys.`;
      if (!ks.length && KF.paths(item).length >= MAX_PATHS) return `Up to ${MAX_PATHS} values can be animated per layer.`;
      return '';
    },
    // add or update the key at t (default: the playhead); returns { key, created } or null at the limit
    put(item, path, v, t) {
      t = KF.snap(t ?? KF.now().t);
      const hit = KF.at(item, path, t);
      if (hit) { hit.v = v; return { key: hit, created: false }; }
      const why = KF.limit(item, path, t);
      if (why) { warnOnce(why); return null; }
      const ks = KF.list(item, path) || [];
      const key = { t, v, e: 'ease' };
      ks.push(key); ks.sort((a, b) => a.t - b.t);
      item.keys = item.keys || {}; item.keys[path] = ks;
      return { key, created: true };
    },
    remove(item, path, key) {
      const ks = KF.list(item, path); if (!ks || !ks.includes(key)) return;
      if (ks.length === 1) KF.clear(item, path); else ks.splice(ks.indexOf(key), 1);
    },
    // stop animating: the value at the playhead becomes the plain value
    clear(item, path) {
      if (!item.keys || !(path in item.keys)) return;
      const v = KF.value(item, path);
      delete item.keys[path];
      if (Number.isFinite(v)) setP(item, path, Math.round(v * 1e4) / 1e4);
      if (!Object.keys(item.keys).length) delete item.keys;
    },
    // the gesture is over: the next limit hit toasts again
    endGesture() { warned = false; },
    label(item, kind, path) {
      if (path === 'opacity') return 'Opacity';
      if (path.startsWith('xf.')) return XF_LABELS[path.slice(3)] || path.slice(3);
      const m = /^params\.(\w+)(?:\.colors\.(\d+)\.w)?$/.exec(path);
      if (!m) return path;
      if (m[2] != null) return `Colour ${+m[2] + 1} strength`;
      const def = kind === 'layer' ? PL.LAYERS[item.type] : PL.EFFECTS[item.type];
      const pd = def && def.params.find((p) => p.k === m[1]);
      return pd ? pd.l : m[1];
    },
  };

  // Inline SVGs (not in the shared icon set): the key diamond and the clip arrow.
  const SVGNS = 'http://www.w3.org/2000/svg';
  function svg(paths, cls) {
    const s = document.createElementNS(SVGNS, 'svg');
    for (const [k, v] of [['viewBox', '0 0 24 24'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '1.8'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round'], ['aria-hidden', 'true']]) s.setAttribute(k, v);
    if (cls) s.setAttribute('class', cls);
    s.innerHTML = paths;
    return s;
  }
  const DIAMOND = '<path class="o" d="M12 3.5 20.5 12 12 20.5 3.5 12Z"/><path class="i" d="M12 9.2 14.8 12 12 14.8 9.2 12Z"/>';
  const CLIP = '<path d="M6 4v7a4 4 0 0 0 4 4h9"/><path d="m15 11 4 4-4 4"/>';

  // Key buttons of the open settings panel, kept in step with the playhead.
  let live = []; // { kb, item, path, sl, show }; show(t): extra display kept in step (the strength chips)
  function keyBtn(label, item, path, sl, show) {
    const name = 'Keyframe for ' + label;
    const kb = h('button', { type: 'button', class: 'icon-btn sm kf-btn', 'aria-label': name, 'data-tip': name, 'aria-pressed': 'false', onclick: () => toggleKey(item, path) }, svg(DIAMOND));
    const x = { kb, item, path, sl, show };
    kb._kf = x; live.push(x); syncKey(x);
    return kb;
  }
  // off: not animated (small outline) · anim: animated, no key here (ring with a dot) · key: a key at this frame (filled)
  function syncKey(x, t = KF.now().t) {
    if (x.show) x.show(t);
    const anim = KF.animated(x.item, x.path), here = anim && !!KF.at(x.item, x.path, t);
    const st = here ? 'key' : anim ? 'anim' : 'off';
    if (x.kb.dataset.state === st) return;
    x.kb.dataset.state = st;
    x.kb.setAttribute('aria-pressed', String(here));
    x.kb.dataset.hint = here ? 'Removes the key at this frame' : anim ? 'Animated. Adds a key at this frame' : 'Animates it: adds a key at this frame';
  }
  function toggleKey(item, path) {
    const { t } = KF.now();
    const here = KF.at(item, path, t);
    KF.endGesture(); // a click is a gesture of its own
    if (here) KF.remove(item, path, here);
    else if (!KF.put(item, path, KF.value(item, path, t), t)) return;
    A.changed(true); keysChanged();
  }
  // don't fight the user: a slider being dragged or a number being typed keeps its value
  const busy = (sl) => { const a = document.activeElement; return (sl.contains(a) && a.type === 'text') || !!sl.querySelector('input[type="range"]:active'); };
  function refreshKeyUI() {
    live = live.filter((x) => x.kb.isConnected);
    const { t } = KF.now();
    for (const x of live) {
      syncKey(x, t);
      if (x.sl && KF.animated(x.item, x.path) && !busy(x.sl)) x.sl.set(KF.value(x.item, x.path, t));
    }
  }
  // after any key edit: key buttons, keyed sliders and the timeline. opts.focus: a key to focus in the timeline
  function keysChanged(opts) { refreshKeyUI(); if (A.refreshTimeline) A.refreshTimeline(opts); }
  document.addEventListener('paint:frame', () => refreshKeyUI()); // fired by playback.js on every frame change

  // A slider whose value can be keyed: while it's animated, moving it sets the key at the playhead.
  function kslider(label, item, path, opts) {
    const sl = slider(label, KF.value(item, path), Object.assign({}, opts, {
      onInput: (x) => {
        if (KF.animated(item, path)) {
          A.pause && A.pause();
          const r = KF.put(item, path, x);
          if (!r) { sl.set(KF.value(item, path)); return; } // at the key limit: the slider goes straight back
          syncKey(kb._kf);
          if (r && r.created && A.refreshTimeline) A.refreshTimeline();
        } else KF.setBase(item, path, x);
        opts.onInput && opts.onInput(x);
      },
      onCommit: (x) => { KF.endGesture(); opts.onCommit && opts.onCommit(x); if (KF.animated(item, path)) keysChanged(); },
    }));
    const kb = keyBtn(label, item, path, sl);
    sl.querySelector('.top').append(kb);
    return sl;
  }

  // Palette strengths live inside the shared palette editor, so they're keyed from a row of chips under it.
  // The editor's sliders show the base strengths; an animated strength shows its value at the playhead on its chip.
  function strengthKeys(item, k, pal) {
    const row = h('div', { class: 'kf-str' });
    const note = h('p', { class: 'hint', hidden: true }, 'The strength sliders show base values. A chip shows its animated strength at the playhead.');
    const pathOf = (i) => `params.${k}.colors.${i}.w`;
    row.sync = () => { note.hidden = !pal.colors.some((_, i) => KF.animated(item, pathOf(i))); };
    row.rebuild = () => {
      row.replaceChildren(h('span', { class: 'label' }, 'Animate colour strengths'), ...pal.colors.map((col, i) => {
        const val = h('span', { class: 'kf-val', hidden: true });
        const show = (t) => {
          const anim = KF.animated(item, pathOf(i));
          val.hidden = !anim;
          if (anim) val.textContent = PL.fmtNum(KF.value(item, pathOf(i), t), 2);
          row.sync();
        };
        const b = keyBtn(`colour ${i + 1} strength`, item, pathOf(i), null, show);
        b.classList.add('kf-chip');
        b.append(h('i', { style: { background: col.c } }), h('span', null, String(i + 1)), val);
        return b;
      }), note);
      row.sync();
    };
    row.rebuild();
    return row;
  }

  // =====================================================================================
  // Groups: doc.groups = [{ id, name, visible, collapsed }], layer.group = id.
  // A group's layers are kept next to each other in the stack.
  // =====================================================================================
  // joined: a layer that just entered its group moves next to the others (on top, or at the bottom).
  function normalizeGroups(d, joined, atBottom) {
    const L = d.layers;
    if (joined && joined.group) {
      const others = L.filter((l) => l !== joined && l.group === joined.group);
      if (others.length) { L.splice(L.indexOf(joined), 1); L.splice(atBottom ? L.indexOf(others[0]) : L.indexOf(others[others.length - 1]) + 1, 0, joined); }
    }
    // every group's layers in one run, anchored at its topmost layer
    const out = [], done = new Set();
    for (let i = L.length - 1; i >= 0; i--) {
      const l = L[i];
      if (!l.group) { out.push(l); continue; }
      if (done.has(l.group)) continue;
      done.add(l.group);
      for (let j = i; j >= 0; j--) if (L[j].group === l.group) out.push(L[j]);
    }
    out.reverse();
    if (out.every((l, i) => l === L[i])) return false;
    L.splice(0, L.length, ...out);
    return true;
  }
  // moves m next to target in the stack; below = under target in the list (top first)
  function moveLayer(L, m, target, below) {
    L.splice(L.indexOf(m), 1);
    const ti = L.indexOf(target);
    L.splice(below ? ti : ti + 1, 0, m);
  }
  function newGroupName(d) { let n = d.groups.length + 1; while (d.groups.some((g) => g.name === 'Group ' + n)) n++; return 'Group ' + n; }
  function addGroup(d, withLayer) {
    if (d.groups.length >= 30) { toast('A paint can have up to 30 groups.'); return null; }
    const g = { id: PL.uid('g'), name: newGroupName(d), visible: true, collapsed: false };
    d.groups.push(g);
    if (withLayer) { withLayer.group = g.id; normalizeGroups(d, withLayer); }
    return g;
  }
  function ungroup(d, g) {
    d.groups.splice(d.groups.indexOf(g), 1);
    for (const l of d.layers) if (l.group === g.id) delete l.group;
    A.renderEditor(); A.changed(true);
    toast(`Ungrouped ${g.name}. Ctrl+Z brings it back.`);
  }

  // Folding a group is a view setting, like an open panel: kept out of the document, so it's never an
  // undo step (a later commit or Undo would otherwise pick a changed g.collapsed up). g.collapsed from a
  // file is the default until the group is folded or opened here.
  const FOLD_KEY = 'cyexPaints.foldedGroups';
  let foldState = new Map(); // group id -> folded
  try { const f = JSON.parse(localStorage.getItem(FOLD_KEY) || '[]'); if (Array.isArray(f)) foldState = new Map(f.filter((x) => Array.isArray(x) && x.length === 2)); } catch (e) {}
  const saveFold = () => { try { localStorage.setItem(FOLD_KEY, JSON.stringify([...foldState].slice(-200))); } catch (e) {} };
  const isFolded = (g) => (foldState.has(g.id) ? !!foldState.get(g.id) : !!g.collapsed);

  // ---- moving rows of the layers list (top first): layers, and groups as a whole ----
  // a row of the list: { g } for a group's folder row, { l } for a layer row
  const rowsOf = (d, list) => [...list.children].filter((x) => x.classList.contains('sortable-item')).map((row) => {
    const g = d.groups.find((x) => x.id === row.dataset.id);
    return g ? { g } : { l: d.layers.find((x) => x.id === row.dataset.id) };
  });
  const runOf = (d, gid) => d.layers.filter((l) => l.group === gid); // bottom first, like the stack
  const blockOf = (d, r) => (r.g ? runOf(d, r.g.id) : r.l.group ? runOf(d, r.l.group) : [r.l]);
  // moves the layers of run next to block in the stack; below = under it in the list
  function placeRun(L, run, block, below) {
    for (const l of run) L.splice(L.indexOf(l), 1);
    const i = below ? L.indexOf(block[0]) : L.indexOf(block[block.length - 1]) + 1;
    L.splice(i, 0, ...run);
  }
  function moveLayerRow(d, m, T, below, kb) {
    const L = d.layers;
    if (T.l) {
      const target = T.l;
      if (target === m) return false;
      if (kb && (m.group || '') !== (target.group || '')) {
        // with the keyboard, crossing a group edge is a step of its own: leave the group in place, or join the next one
        if (m.group) delete m.group;
        else { m.group = target.group; normalizeGroups(d, m, !below); }
      } else {
        moveLayer(L, m, target, below);
        // a dragged layer joins the group of the row it was dropped on (or leaves its own)
        if (!kb) { if (target.group) m.group = target.group; else delete m.group; }
      }
      return true;
    }
    // onto a group's folder row
    const g = T.g, run = runOf(d, g.id).filter((l) => l !== m);
    if (m.group === g.id) { delete m.group; if (run.length) placeRun(L, [m], run, false); return true; } // its own: leaves it, above
    if (kb && m.group) { delete m.group; return true; } // leaving its own group first, as above
    if (!run.length) { m.group = g.id; return true; } // an empty group: the layer starts it
    if (below && !isFolded(g)) { m.group = g.id; normalizeGroups(d, m, false); return true; } // down onto an open group: joins on top
    delete m.group; placeRun(L, [m], run, below); // up onto a group, or onto a folded one: past the whole group
    return true;
  }
  function moveGroup(d, rows, from, to, kb) {
    const g = rows[from].g, run = runOf(d, g.id), below = to > from;
    if (!run.length) {
      // empty groups sit on top: only their order among themselves changes
      const T = rows[to];
      if (!T || !T.g || runOf(d, T.g.id).length) return false;
      const G = d.groups; G.splice(G.indexOf(g), 1); G.splice(G.indexOf(T.g) + (below ? 1 : 0), 0, g);
      return true;
    }
    let T = rows[to];
    if (kb) {
      // the keyboard steps past a whole neighbour: the row above the folder row, or the first row after the group's layers
      let j = from + (below ? 1 : -1);
      if (below) while (rows[j] && rows[j].l && rows[j].l.group === g.id) j++;
      T = rows[j];
    }
    if (!T || (T.l && T.l.group === g.id)) return false;
    if (T.g && !runOf(d, T.g.id).length) return false; // the empty groups on top stay on top
    placeRun(d.layers, run, blockOf(d, T), below);
    return true;
  }
  function moveRow(d, list, from, to, kb) {
    const rows = rowsOf(d, list), r = rows[from];
    if (!r || !rows[to] || from === to) return;
    const id = r.g ? r.g.id : r.l && r.l.id; if (!id) return;
    // the keyboard keeps the moved row's grip, also when nothing could move (after sortable's own refocus)
    const f = () => $(`#editor [data-id="${id}"] .grip`)?.focus();
    if (!(r.g ? moveGroup(d, rows, from, to, kb) : moveLayerRow(d, r.l, rows[to], to > from, kb))) { if (kb) setTimeout(() => setTimeout(f)); return; }
    normalizeGroups(d);
    A.renderEditor(); A.changed(true);
    if (kb) { f(); setTimeout(() => setTimeout(f)); }
  }

  // layers list (top layer first), with group folders; layers of a folded group aren't listed
  function layersList(d) {
    const gById = new Map(d.groups.map((g) => [g.id, g]));
    const list = h('div', { class: 'list', role: 'list', 'aria-label': 'Layers, top first' });
    const items = [...d.layers].reverse();
    if (!items.length && !d.groups.length) list.append(h('div', { class: 'empty', role: 'listitem' }, icon('layers'), h('span', null, 'No layers yet. Add one, pick a preset, or drop an image here.')));
    const counts = new Map();
    for (const l of d.layers) if (l.group) counts.set(l.group, (counts.get(l.group) || 0) + 1);
    for (const g of d.groups) if (!counts.has(g.id)) list.append(groupRow(d, g, 0)); // empty groups sit on top
    const shown = new Set();
    for (const l of items) {
      const g = l.group ? gById.get(l.group) : null;
      if (g && !shown.has(g.id)) { shown.add(g.id); list.append(groupRow(d, g, counts.get(g.id))); }
      if (g && isFolded(g)) continue;
      list.append(listItem(l, 'layer', d.layers, g));
    }
    sortable(list, (from, to, kb) => moveRow(d, list, from, to, kb));
    return list;
  }

  // =====================================================================================
  // Animated editor
  // =====================================================================================
  const FPS = [[10, '10'], [20, '20'], [25, '25'], [33, '33'], [50, '50']];

  const findSel = () => {
    const s = A.state.sel; if (!s) return null;
    const list = s.kind === 'layer' ? A.state.anim.layers : A.state.anim.effects;
    const item = list.find((x) => x.id === s.id);
    return item ? { kind: s.kind, item, list } : null;
  };

  let lastSettingsId = null;
  const titleOf = (kind, def, item) => (kind === 'layer' ? (def.draw ? 'Element: ' : 'Layer: ') : 'Effect: ') + (item.name || def.name);

  // Selecting only swaps the settings column and the row highlight: no full editor rebuild,
  // so it stays instant with dozens of layers.
  function selectItem(kind, id) {
    if (A.state.sel && A.state.sel.id === id) return;
    A.state.sel = { kind, id };
    for (const row of document.querySelectorAll('#editor .item')) {
      const on = row.dataset.id === id;
      row.classList.toggle('sel', on);
      const nb = row.querySelector('.name'); if (nb) { if (on) nb.setAttribute('aria-current', 'true'); else nb.removeAttribute('aria-current'); }
    }
    const col = $('.settings-col'), s = findSel();
    if (col) col.replaceChildren(s ? settingsPanel(s) : emptySettings());
    A.save();
  }
  const emptySettings = () => panel('Settings', [h('div', { class: 'empty' }, icon('layers'), h('span', null, 'Select a layer or effect to change it.'))], [], { key: 'settings-empty' });
  // keep every place that shows an item's name in step while it is renamed
  function syncNames(item) {
    const s = findSel();
    const row = $(`#editor [data-id="${item.id}"]`);
    const nb = row && row.querySelector('button.name'); if (nb) { nb.textContent = item.name; nb.title = nameTitle(item.name, ITEM_RENAME); }
    const g = row && row.querySelector('.grip'); if (g) g.setAttribute('aria-label', 'Move ' + item.name);
    if (s && s.item === item) {
      const def = s.kind === 'layer' ? PL.LAYERS[item.type] : PL.EFFECTS[item.type];
      const t = $('#settingsPanel .ptoggle span'); if (t) t.textContent = titleOf(s.kind, def, item);
      const tg = $('#settingsPanel .ptoggle'); if (tg) tg.dataset.tip = titleOf(s.kind, def, item);
    }
  }

  function renderAnimEditor(root) {
    const d = A.state.anim;
    if (!findSel()) A.state.sel = d.layers.length ? { kind: 'layer', id: d.layers[d.layers.length - 1].id } : d.effects.length ? { kind: 'effect', id: d.effects[0].id } : null;
    root.classList.add('anim');
    const colA = h('div', { class: 'col' }), colB = h('div', { class: 'col settings-col' });
    root.append(colA, colB);

    if (!Array.isArray(d.groups)) d.groups = [];
    const gIds = new Set(d.groups.map((g) => g.id));
    for (const l of d.layers) if (l.group && !gIds.has(l.group)) delete l.group;
    if (normalizeGroups(d)) A.rt.dirty = true; // only hand-edited files have split groups
    const layerList = layersList(d);
    colA.append(panel('Layers', [layerList, h('div', { class: 'row' },
      btn('Add layer', () => A.openLibrary('layer'), 'secondary small', 'plus'),
      btn('Add element', () => A.openLibrary('layer', 'Scene elements'), 'ghost small', 'sparkles'),
      newGroupBtn(d))], [], { count: d.layers.length }));

    const fxList = h('div', { class: 'list', role: 'list', 'aria-label': 'Effects, applied top to bottom' });
    if (!d.effects.length) fxList.append(h('div', { class: 'empty', role: 'listitem' }, icon('fx'), h('span', null, 'Effects run on the finished image, top to bottom: lighting, 3D, distortion, colour.')));
    for (const e of d.effects) fxList.append(listItem(e, 'effect', d.effects));
    sortable(fxList, (from, to, kb) => {
      const [it] = d.effects.splice(from, 1); d.effects.splice(to, 0, it);
      A.renderEditor(); A.changed(true);
      if (kb) $(`#editor [data-id="${it.id}"] .grip`)?.focus();
    });
    colA.append(panel('Effects', [fxList, h('div', { class: 'row' }, btn('Add effect', () => A.openLibrary('effect'), 'secondary small', 'plus'))], [], { count: d.effects.length }));
    colA.append(paintPanel(d));
    colA.append(A.shadowsPanel(d.shadows));

    const s = findSel();
    colB.append(s ? settingsPanel(s) : emptySettings());
    scheduleThumbs(true);
  }

  // A new frame count (fps or loop length): every key moves to a whole frame of the new count,
  // and of two keys that land on one frame the later one stays
  function resnapKeys(d) {
    const n = E.frameCount(d);
    for (const it of [...d.layers, ...d.effects]) {
      if (!it.keys) continue;
      for (const [path, ks] of Object.entries(it.keys)) {
        if (!Array.isArray(ks)) continue;
        const at = new Map();
        for (const k of ks.slice().sort((a, b) => a.t - b.t)) at.set(PL.clamp(Math.round(k.t * n), 0, n - 1), k);
        it.keys[path] = [...at].sort((a, b) => a[0] - b[0]).map(([f, k]) => { k.t = f / n; return k; });
      }
    }
  }

  function paintPanel(d) {
    const info = h('span', { class: 'stat' });
    const setInfo = () => { info.textContent = `${E.frameCount(d)} frames · ${PL.fmtNum(d.duration, 1)} s · ${Math.round(100 / d.fps)} cs per frame`; };
    setInfo();
    const wIn = h('input', { class: 'num', value: d.width, 'aria-label': 'Width (px)' }), hIn = h('input', { class: 'num', value: d.height, 'aria-label': 'Height (px)' });
    const size = () => { d.width = Math.max(8, Math.min(1024, parseInt(wIn.value) || 256)); d.height = Math.max(8, Math.min(512, parseInt(hIn.value) || 64)); wIn.value = d.width; hIn.value = d.height; A.changed(true); scheduleThumbs(true); };
    wIn.onchange = size; hIn.onchange = size;
    const sizePresets = seg([['256x64', '256×64'], ['320x64', '320×64'], ['384x96', '384×96'], ['512x128', '512×128']], `${d.width}x${d.height}`, (v) => { const [a, b] = v.split('x').map(Number); d.width = a; d.height = b; wIn.value = a; hIn.value = b; A.changed(true); scheduleThumbs(true); }, 'Size presets');
    d.tweak = Object.assign({}, E.DEFAULT_TWEAK, d.tweak || {});
    return panel('Paint', [
      A.nameField(d),
      group('Size and timing', [
        h('div', { class: 'ctl' }, h('div', { class: 'top' }, h('span', { class: 'label' }, 'Size'), wIn, h('span', { class: 'unit' }, '×'), hIn, h('span', { class: 'unit' }, 'px')), sizePresets,
          h('p', { class: 'hint' }, '7TV stretches the image across the name, so a wide strip works best.')),
        labeled('Frames per second', seg(FPS, d.fps, (v) => { d.fps = v; setInfo(); resnapKeys(d); A.changed(true); keysChanged(); }, 'Frames per second')),
        slider('Loop length', d.duration, { min: 0.4, max: 8, step: 0.1, unit: 's', onInput: (v) => { d.duration = v; setInfo(); A.changed(false); }, onCommit: () => { resnapKeys(d); A.changed(true); keysChanged(); } }),
        info,
      ]),
      group('Recolour everything', A.tweakControls(d.tweak, 'Shifts the colours of the whole paint, after all layers and effects.')),
    ]);
  }

  // "New group" starts with the selected layer when that layer isn't in a group yet
  function newGroupBtn(d) {
    const b = btn('New group', () => {
      const s = findSel();
      const g = addGroup(d, s && s.kind === 'layer' && !s.item.group ? s.item : null);
      if (!g) return;
      A.renderEditor(); A.changed(true);
      setTimeout(() => $(`#editor [data-id="${g.id}"] .name`)?.focus({ preventScroll: true }));
    }, 'ghost small', 'folder');
    b.dataset.tip = 'New group'; b.dataset.hint = 'Starts with the selected layer. F2 renames it';
    return b;
  }

  // the name buttons' tooltip: the full name (it may be cut off), then how to rename
  const nameTitle = (name, how) => name + '\n' + how;
  const ITEM_RENAME = 'Double-click or F2 to rename', GROUP_RENAME = 'Double-click the name or F2 to rename';

  // A group's folder row: the grip moves the whole group (drag, or Alt+Up and Alt+Down), the name button
  // folds and opens it at once (click, Enter or Space), F2 or a double-click on the name renames, Delete ungroups.
  function groupRow(d, g, count) {
    const text = h('span', null, g.name);
    const inName = h('span', { class: 'sr-only', id: 'gin-' + g.id }, 'In ' + g.name); // members' description
    const gr = grip('Move ' + g.name);
    let row = null;
    // in place, no re-render and no history step: the member rows are added or removed under the folder row
    const toggle = () => {
      const fold = !isFolded(g);
      foldState.set(g.id, fold); saveFold();
      nameEl.setAttribute('aria-expanded', String(!fold));
      const list = row.parentElement; if (!list) return;
      if (fold) { for (const r of [...list.children]) if (r.dataset.group === g.id) r.remove(); return; }
      const members = d.layers.filter((l) => l.group === g.id).reverse(); // top first
      row.after(...members.map((l) => listItem(l, 'layer', d.layers, g)));
      scheduleThumbs(true);
    };
    const nameEl = h('button', { type: 'button', class: 'name', title: nameTitle(g.name, GROUP_RENAME), 'aria-expanded': String(!isFolded(g)), onclick: (e) => { if (e.detail < 2) toggle(); } }, icon('chevron'), text);
    const rename = () => {
      const inp = h('input', { class: 'field rename', value: g.name, maxlength: 64, 'aria-label': 'Rename group' });
      let finished = false;
      const done = (ok, byKey) => {
        if (finished) return; finished = true;
        if (ok && inp.value.trim() && inp.value.trim() !== g.name) {
          g.name = inp.value.trim(); text.textContent = g.name; inName.textContent = 'In ' + g.name;
          nameEl.title = nameTitle(g.name, GROUP_RENAME); gr.setAttribute('aria-label', 'Move ' + g.name);
          A.changed(true);
        }
        inp.replaceWith(nameEl);
        if (byKey) nameEl.focus();
      };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(true, true); } if (e.key === 'Escape') { e.preventDefault(); done(false, true); } e.stopPropagation(); });
      inp.addEventListener('blur', () => done(true));
      nameEl.replaceWith(inp); inp.focus(); inp.select();
    };
    // a double-click's first click already folded or opened the group: undo that, then rename
    text.addEventListener('dblclick', () => { toggle(); rename(); });
    row = h('div', {
      class: 'item ghdr sortable-item' + (g.visible ? '' : ' off'), role: 'listitem', 'data-id': g.id,
      onkeydown: (e) => {
        if (e.target !== nameEl) return;
        if (e.key === 'F2') { e.preventDefault(); rename(); }
        if (e.key === 'Delete') { e.preventDefault(); ungroup(d, g); }
      },
    },
    gr, h('span', { class: 'gicon', 'aria-hidden': 'true' }, icon('folder')), nameEl, inName,
    h('span', { class: 'meta' }, count === 1 ? '1 layer' : `${count} layers`),
    h('span', { class: 'tools' },
      iconBtn(g.visible ? 'eye' : 'eyeOff', 'Visible', () => { g.visible = !g.visible; A.renderEditor(); A.changed(true); }, { cls: 'sm', attrs: { 'aria-pressed': String(g.visible), 'data-tip': g.visible ? 'Hide group' : 'Show group' } }),
      iconBtn('x', 'Ungroup', () => ungroup(d, g), { cls: 'sm', attrs: { 'data-hint': 'Keeps its layers' } })));
    return row;
  }

  function listItem(item, kind, list, grp) {
    const isSel = A.state.sel && A.state.sel.id === item.id;
    const def = kind === 'layer' ? PL.LAYERS[item.type] : PL.EFFECTS[item.type];
    const thumb = h('canvas', { class: 'thumb', width: 88, height: 22, 'data-thumb': item.id, 'aria-hidden': 'true' });
    const idx = list.indexOf(item);
    const select_ = () => selectItem(kind, item.id);
    // the name is the row's real control: a named button that selects (Enter or Space), F2 or double-click renames, Delete removes
    // a group member's name is described as "In <group>"
    const nameEl = h('button', { type: 'button', class: 'name', title: nameTitle(item.name || def.name, ITEM_RENAME), 'aria-current': isSel ? 'true' : null, 'aria-describedby': grp ? 'gin-' + grp.id : null, onclick: () => select_() }, item.name || def.name);
    nameEl.addEventListener('dblclick', () => {
      const inp = h('input', { class: 'field rename', value: item.name || def.name, maxlength: 64, 'aria-label': 'Rename' });
      let finished = false;
      // commits in place (no re-render), so a click that ended the rename still lands where it was aimed
      const done = (ok, byKey) => {
        if (finished) return; finished = true;
        if (ok && inp.value.trim()) { item.name = inp.value.trim(); nameEl.textContent = item.name; A.changed(true); syncNames(item); }
        inp.replaceWith(nameEl);
        if (byKey) nameEl.focus();
      };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); done(true, true); } if (e.key === 'Escape') { e.preventDefault(); done(false, true); } e.stopPropagation(); });
      inp.addEventListener('blur', () => done(true));
      nameEl.replaceWith(inp); inp.focus(); inp.select();
    });
    const meta = [];
    if (kind === 'layer' && item.blend !== 'normal') meta.push((PL.BLENDS.find((b) => b[0] === item.blend) || [, ''])[1].split(' (')[0]);
    if (kind === 'layer' && item.opacity < 1) meta.push(Math.round(item.opacity * 100) + '%');
    const el = h('div', {
      class: 'item sortable-item' + (isSel ? ' sel' : '') + (item.visible ? '' : ' off') + (grp ? ' ingroup' : '') + (grp && !grp.visible ? ' ghidden' : '') + (kind === 'layer' && item.clip ? ' clipped' : ''), role: 'listitem', 'data-id': item.id, 'data-group': grp ? grp.id : null,
      onclick: (e) => { if (e.target.closest('button, input')) return; select_(); },
      onkeydown: (e) => {
        if (e.target !== nameEl) return;
        if (e.key === 'F2') { e.preventDefault(); nameEl.dispatchEvent(new MouseEvent('dblclick')); }
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select_(); }
        if (e.key === 'Delete') { e.preventDefault(); remove(); }
      },
    },
    grip(`Move ${item.name || def.name}`),
    kind === 'layer' ? h('span', { class: 'clipmark', 'data-tip': 'Clipped to the layer below' }, svg(CLIP), h('span', { class: 'sr-only' }, 'Clipped to the layer below')) : null,
    thumb, nameEl,
    meta.length ? h('span', { class: 'meta' }, meta.join(' · ')) : null,
    h('span', { class: 'tools' },
      iconBtn(item.visible ? 'eye' : 'eyeOff', 'Visible', () => { item.visible = !item.visible; A.renderEditor(); A.changed(true); }, { cls: 'sm', attrs: { 'aria-pressed': String(item.visible), 'data-tip': item.visible ? 'Hide' : 'Show' } }),
      iconBtn('dup', 'Duplicate', () => { const c = clone(item); c.id = PL.uid(kind[0]); list.splice(idx + 1, 0, c); A.state.sel = { kind, id: c.id }; A.renderEditor(); A.changed(true); }, { cls: 'sm' }),
      iconBtn('trash', 'Delete', () => remove(), { cls: 'sm danger', attrs: { 'data-hint': 'Delete (Del)' } })));
    function remove() { list.splice(list.indexOf(item), 1); if (isSel) A.state.sel = null; A.renderEditor(); A.changed(true); toast(`Removed ${item.name || def.name}. Ctrl+Z brings it back.`); }
    return el;
  }

  // ctx = { item }: the layer or effect these params belong to, so range sliders and palette strengths can be keyed
  function paramControl(pd, params, onInput, onCommit, ctx) {
    const v = params[pd.k];
    switch (pd.t) {
      case 'range': {
        const ro = { min: pd.min, max: pd.max, step: pd.step, hint: pd.hint };
        const sl = ctx && pd.k !== 'seed' ? kslider(pd.l, ctx.item, 'params.' + pd.k, Object.assign(ro, { onInput: () => onInput(), onCommit }))
          : slider(pd.l, v, Object.assign(ro, { onInput: (x) => { params[pd.k] = x; onInput(); }, onCommit }));
        if (pd.hint) sl.querySelector('.label').append(h('span', { class: 'qhint', 'data-tip': pd.hint, tabindex: '-1' }, '?'));
        if (pd.k === 'seed') sl.querySelector('.top').append(iconBtn('dice', 'New random seed', () => { params.seed = 1 + Math.floor(Math.random() * 999); sl.set(params.seed); onCommit(); }, { cls: 'sm' }));
        return sl;
      }
      case 'color': return labeled(pd.l, colorField(v, null, (hx, a, c) => { params[pd.k] = hx; c ? onCommit() : onInput(); }, { label: pd.l }));
      case 'select': return labeled(pd.l, select(pd.o, v, (x) => { params[pd.k] = x; onCommit(); }, pd.l));
      case 'bool': return checkbox(pd.l, !!v, (x) => { params[pd.k] = x; onCommit(); });
      case 'text': {
        const inp = h('input', { class: 'field', value: v, maxlength: 60, 'aria-label': pd.l, oninput: () => { params[pd.k] = inp.value; onInput(); }, onchange: onCommit });
        const quick = h('div', { class: 'chips' }, ['❄', '🌸', '⭐', '♥', '✦', '🔥', '✨', '💜', '☾', '⚡', '🎵', '👑', '🍀', '🦋', '💎', '☁'].map((ch) => h('button', { type: 'button', class: 'chip', 'aria-label': 'Use ' + ch, onclick: () => { params[pd.k] = ch; inp.value = ch; onCommit(); } }, ch)));
        return labeled(pd.l, h('div', { class: 'stack tight' }, inp, quick));
      }
      case 'stops': return labeled(pd.l, stopsEditor(params[pd.k], (s, c) => { c ? onCommit() : onInput(); }, { palettes: true }));
      case 'palette': {
        const pal = params[pd.k];
        if (!ctx) return paletteEditor(pal, (p, c) => { c ? onCommit() : onInput(); });
        const { item } = ctx, pre = `params.${pd.k}.colors.`;
        let prev = pal.colors.slice(), prevW = pal.colors.map((c) => c.w), pending = false;
        const keysRow = strengthKeys(item, pd.k, pal);
        const ed = paletteEditor(pal, (p, c) => {
          const cols = pal.colors;
          const same = cols.length === prev.length && cols.every((x, i) => x === prev[i]);
          let moved = false, keyed = false;
          if (!same) {
            // colours were added, removed, reordered or replaced: strength keys follow their colour
            const old = {};
            for (const path of Object.keys(item.keys || {})) if (path.startsWith(pre)) { old[path] = item.keys[path]; delete item.keys[path]; }
            for (const [path, ks] of Object.entries(old)) { const j = cols.indexOf(prev[parseInt(path.slice(pre.length), 10)]); if (j >= 0) item.keys[pre + j + '.w'] = ks; }
            if (item.keys && !Object.keys(item.keys).length) delete item.keys;
            moved = Object.keys(old).length > 0;
          } else {
            // a strength slider moved while that strength is animated: it sets the key at the playhead
            cols.forEach((col, i) => {
              if (col.w === prevW[i] || !KF.animated(item, pre + i + '.w')) return;
              A.pause && A.pause();
              if (KF.put(item, pre + i + '.w', col.w)) { keyed = true; return; }
              // at the key limit: the strength and its slider go straight back
              col.w = prevW[i];
              const r = ed.querySelector(`input[type="range"][aria-label="Colour ${i + 1} strength"]`);
              if (r) { r.value = col.w; r.style.setProperty('--p', (col.w / 4) * 100 + '%'); }
            });
          }
          if (c) KF.endGesture();
          prev = cols.slice(); prevW = cols.map((x) => x.w);
          if (keyed) pending = true;
          if (!same || c) keysRow.rebuild(); // colour count, order and swatches
          c ? onCommit() : onInput();
          if (moved || (pending && c)) { pending = false; keysChanged(); } else if (keyed) refreshKeyUI();
        });
        ed.append(keysRow);
        return ed;
      }
      case 'image': {
        const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', class: 'sr-only', onchange: async () => {
          const f = file.files[0]; if (!f) return;
          try { params[pd.k] = await fileToDataUrl(f, 512); await cacheImage(params[pd.k]); onCommit(); A.renderEditor(); }
          catch (e) { toast('Couldn’t read that image. Try a PNG, JPG or WebP file.', 'error'); }
        } });
        return labeled(pd.l, h('div', { class: 'row' }, h('label', { class: 'btn secondary small' }, icon('image'), v ? 'Replace image' : 'Choose image', file),
          h('span', { class: 'hint' }, v ? 'Stored in this project (max 512 px).' : 'PNG, JPG or WebP. You can also drop a file anywhere on the page.')));
      }
    }
    return null;
  }

  const GROUP_ORDER = ['Colours', 'Shape', 'Settings', 'Placement', 'Motion', 'Copies', 'Glow and outline'];
  const groupOf = (pd) => pd.g || (pd.t === 'palette' || pd.t === 'stops' || pd.t === 'color' ? 'Colours' : 'Settings');
  const visibleKeys = (def, params) => def.params.filter((pd) => !pd.show || pd.show(params)).map((pd) => pd.k).join(',');

  function settingsPanel(s) {
    const { item, kind } = s;
    const def = kind === 'layer' ? PL.LAYERS[item.type] : PL.EFFECTS[item.type];
    let vis = visibleKeys(def, item.params);
    const refreshIfNeeded = () => { const nv = visibleKeys(def, item.params); if (nv !== vis) { vis = nv; const old = $('#settingsPanel'); if (old) { const fd = A.focusDescriptor(); old.replaceWith(settingsPanel(s)); A.restoreFocus(fd); } } };
    const onInput = () => A.changed(false), onCommit = () => { A.changed(true); refreshIfNeeded(); };
    const nameIn = h('input', { class: 'field', value: item.name || def.name, maxlength: 64, 'aria-label': 'Name', 'data-sel-first': '', oninput: () => { item.name = nameIn.value; syncNames(item); A.changed(false); }, onchange: () => A.commit() });
    const top = [h('p', { class: 'hint' }, def.desc), labeled('Name', nameIn)];
    if (kind === 'layer') {
      top.push(h('div', { class: 'split' },
        labeled('Blend', select(PL.BLENDS, item.blend, (v) => { item.blend = v; A.renderEditor(); A.changed(true); }, 'Blend')),
        kslider('Opacity', item, 'opacity', { min: 0, max: 1, step: 0.01, scale: 100, unit: '%', decimals: 0, onInput, onCommit })));
      // group membership and clipping
      const d = A.state.anim;
      if (!Array.isArray(d.groups)) d.groups = [];
      const gOpts = [['', 'No group'], ...d.groups.map((g) => [g.id, g.name]), ['+new', 'New group']];
      const clip = checkbox('Clip to layer below', !!item.clip, (v) => {
        item.clip = v;
        $(`#editor .item[data-id="${item.id}"]`)?.classList.toggle('clipped', v); // in place, so focus stays on the box
        A.changed(true);
      });
      clip.dataset.tip = 'Clip to layer below'; clip.dataset.hint = 'Shows this layer only where the layer under it is drawn';
      // nothing below to clip to: the bottom layer, or the bottom of its group (still on, it can be turned off)
      const L = d.layers, bottom = L[0] === item || (!!item.group && L.find((l) => l.group === item.group) === item);
      let why = null;
      if (bottom && !item.clip) {
        const msg = item.group ? 'It’s the bottom layer of its group, so there’s nothing below it to clip to' : 'It’s the bottom layer, so there’s nothing below it to clip to';
        why = h('span', { class: 'sr-only', id: 'clipWhy' }, msg);
        const box = clip.querySelector('input'); box.disabled = true; box.setAttribute('aria-describedby', 'clipWhy');
        clip.dataset.hint = msg;
      }
      top.push(h('div', { class: 'split' },
        labeled('Group', select(gOpts, item.group || '', (v) => {
          if (v === '+new') { if (!addGroup(d, item)) { A.renderEditor(); return; } }
          else if (v) { item.group = v; normalizeGroups(d, item); }
          else { delete item.group; normalizeGroups(d); }
          A.renderEditor(); A.changed(true);
        }, 'Group')),
        h('div', { class: 'ctl kf-clip' }, clip, why)));
    }
    const groups = new Map();
    for (const pd of def.params) {
      if (pd.show && !pd.show(item.params)) continue;
      const c = paramControl(pd, item.params, onInput, onCommit, { item });
      if (!c) continue;
      const g = groupOf(pd);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(c);
    }
    const body = [...top];
    // the keyframe timeline: one row per animated value (timeline.js)
    if (A.timeline) body.push(group('Keyframes', [A.timeline(s)], { count: KF.paths(item).length || '' }));
    const names = [...groups.keys()].sort((a, b) => (GROUP_ORDER.indexOf(a) + 99) % 99 - (GROUP_ORDER.indexOf(b) + 99) % 99);
    for (const g of names) body.push(group(g, groups.get(g)));
    if (kind === 'layer') {
      const xf = item.xf;
      body.push(group('Move and transform', [
        h('div', { class: 'split' },
          kslider('Scale', item, 'xf.scale', { min: 0.1, max: 6, step: 0.05, onInput, onCommit }),
          kslider('Rotate', item, 'xf.rotate', { min: -180, max: 180, step: 1, unit: '°', onInput, onCommit }),
          kslider('Offset x', item, 'xf.ox', { min: -1, max: 1, step: 0.01, onInput, onCommit }),
          kslider('Offset y', item, 'xf.oy', { min: -1, max: 1, step: 0.01, onInput, onCommit }),
          slider('Scroll x', xf.sx, { min: -8, max: 8, step: 1, hint: 'Full widths per loop', onInput: (v) => { xf.sx = v; onInput(); }, onCommit }),
          slider('Scroll y', xf.sy, { min: -8, max: 8, step: 1, hint: 'Full heights per loop', onInput: (v) => { xf.sy = v; onInput(); }, onCommit }),
          slider('Spin', xf.spin, { min: -8, max: 8, step: 1, hint: 'Turns per loop', onInput: (v) => { xf.spin = v; onInput(); }, onCommit })),
        checkbox('Wrap around the edges when moved', xf.tile, (v) => { xf.tile = v; onCommit(); }),
        h('p', { class: 'hint' }, 'Moves the whole layer. Scroll and spin use whole numbers so the loop stays seamless. To move it along a path, key the offsets.')]));
      item.tweak = Object.assign({}, E.DEFAULT_TWEAK, item.tweak || {});
      body.push(group('Colour tweaks', A.tweakControls(item.tweak, 'Shift the colours of just this layer.')));
    }
    const hasXY = def.params.some((pd) => pd.k === 'x') || def.params.some((pd) => pd.k === 'cx' && /^Centre/.test(pd.l));
    if (hasXY) body.splice(2, 0, h('p', { class: 'hint drag-hint' }, icon('move'), 'Drag on the paint image to move it, or use the X and Y sliders below.'));
    const reset = iconBtn('reset', 'Reset to defaults', () => { item.params = E.defaults(def); delete item.keys; if (item.xf) item.xf = Object.assign({}, E.DEFAULT_XF); if (item.tweak) item.tweak = Object.assign({}, E.DEFAULT_TWEAK); A.renderEditor(); A.changed(true); }, { cls: 'sm' });
    const dup = iconBtn('dup', 'Duplicate', () => { const list = s.list, c = clone(item); c.id = PL.uid(kind[0]); list.splice(list.indexOf(item) + 1, 0, c); A.state.sel = { kind, id: c.id }; A.renderEditor(); A.changed(true); }, { cls: 'sm' });
    // No collapse-all button: the panel title already folds the whole settings panel, and each group
    // opens on its own and stays the way it was left.
    // a new selection always opens the settings panel, even if it was collapsed for the previous one
    const fresh = lastSettingsId !== item.id; lastSettingsId = item.id;
    return panel(titleOf(kind, def, item), body, [dup, reset], { id: 'settingsPanel', key: 'settings', open: fresh || undefined });
  }

  function fileToDataUrl(file, max) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = async () => {
        try {
          const im = await A.loadImage(r.result);
          const k = Math.min(1, max / Math.max(im.width, im.height));
          const cv = h('canvas', { width: Math.max(1, Math.round(im.width * k)), height: Math.max(1, Math.round(im.height * k)) });
          cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
          res(cv.toDataURL('image/png'));
        } catch (e) { rej(e); }
      };
      r.onerror = rej; r.readAsDataURL(file);
    });
  }
  async function cacheImage(src) {
    if (!src || PL.imageCache[src]) return;
    const im = await A.loadImage(src);
    const cv = h('canvas', { width: im.width, height: im.height }), ctx = cv.getContext('2d');
    ctx.drawImage(im, 0, 0);
    PL.imageCache[src] = { w: im.width, h: im.height, data: ctx.getImageData(0, 0, im.width, im.height).data };
  }
  async function cacheDocImages(doc) {
    const srcs = doc.layers.filter((l) => (l.type === 'image' || l.type === 'sprite') && l.params.src).map((l) => l.params.src);
    await Promise.all(srcs.map((s) => cacheImage(s).catch(() => {})));
    if (srcs.length) { A.rt.dirty = true; scheduleThumbs(true); }
  }

  // ---- thumbnails ----
  let thumbTimer = 0;
  function scheduleThumbs(now) { clearTimeout(thumbTimer); thumbTimer = setTimeout(drawThumbs, now ? 0 : 250); }
  // Thumbnails are cached per item, keyed by everything that changes its picture, so a click or a
  // change to one layer re-renders only that layer's thumb (effect thumbs also depend on the layers).
  const thumbCache = new Map(); // id -> { key, canvas }
  const keyOf = (x) => JSON.stringify(x, (k, v) => (k === 'src' && typeof v === 'string' ? v.length + ':' + v.slice(-24) + (PL.imageCache[v] ? '+' : '-') : k === 'name' ? undefined : v));
  function drawThumbs() {
    if (A.state.mode !== 'anim') return;
    const d = A.state.anim, t = 0.15;
    const size = d.width + 'x' + d.height + keyOf(d.tweak), layersKey = keyOf(d.layers);
    const alive = new Set();
    for (const cv of document.querySelectorAll('[data-thumb]')) {
      const id = cv.dataset.thumb;
      const l = d.layers.find((x) => x.id === id), e = d.effects.find((x) => x.id === id);
      let mini;
      if (l) mini = Object.assign({}, d, { layers: [Object.assign({}, l, { visible: true, opacity: 1, blend: 'normal' })], effects: [] });
      else if (e) mini = Object.assign({}, d, { effects: [Object.assign({}, e, { visible: true })] });
      else continue;
      alive.add(id);
      const key = size + (l ? keyOf(Object.assign({}, l, { visible: true, opacity: 1, blend: 'normal' })) : keyOf(e) + layersKey);
      const hit = thumbCache.get(id);
      if (hit && hit.key === key) { const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height); ctx.drawImage(hit.canvas, 0, 0, cv.width, cv.height); continue; }
      const cp = E.compile(mini);
      // render at the paint's aspect, then letterbox into the thumb
      // full paint size (capped), then scaled down: small particles stay visible, and the cache keeps it cheap
      const W = Math.min(d.width, 256), H = Math.max(4, Math.round(W / (d.width / d.height)));
      const img = E.toImageData(E.renderBuf(cp, t, W, H), W, H);
      const tmp = h('canvas', { width: W, height: H }); tmp.getContext('2d').putImageData(img, 0, 0);
      const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(tmp, 0, 0, cv.width, cv.height); // stretched, the way 7TV stretches it over a name
      thumbCache.set(id, { key, canvas: tmp });
    }
    for (const id of thumbCache.keys()) if (!alive.has(id)) thumbCache.delete(id);
  }

  Object.assign(A, { findSel, renderAnimEditor, settingsPanel, fileToDataUrl, cacheImage, cacheDocImages, scheduleThumbs, kf: KF, keysChanged, refreshKeyUI, normalizeGroups });
})(window.PL);
