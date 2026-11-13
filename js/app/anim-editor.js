/* cyex paints: the animated editor: layers, effects, settings panel, images and thumbnails. */
(function (PL) {
  'use strict';
  const { h, icon, iconBtn, btn, panel, slider, seg, checkbox, labeled, select, colorField, stopsEditor, paletteEditor, sortable, grip, group, toast } = PL.UI;
  const E = PL.Engine, clone = PL.clone;
  const A = (PL.App = PL.App || {});
  const $ = A.$; // store.js loads first

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

  function renderAnimEditor(root) {
    const d = A.state.anim;
    if (!findSel()) A.state.sel = d.layers.length ? { kind: 'layer', id: d.layers[d.layers.length - 1].id } : d.effects.length ? { kind: 'effect', id: d.effects[0].id } : null;
    root.classList.add('anim');
    const colA = h('div', { class: 'col' }), colB = h('div', { class: 'col settings-col' });
    root.append(colA, colB);

    // layers list (top layer first)
    const layerList = h('div', { class: 'list', role: 'list', 'aria-label': 'Layers, top first' });
    const items = [...d.layers].reverse();
    if (!items.length) layerList.append(h('div', { class: 'empty' }, icon('layers'), h('span', null, 'No layers yet. Add one, pick a preset, or drop an image here.')));
    for (const l of items) layerList.append(listItem(l, 'layer', d.layers));
    sortable(layerList, (from, to, kb) => {
      const n = d.layers.length, a = n - 1 - from, b = n - 1 - to;
      const [it] = d.layers.splice(a, 1); d.layers.splice(b, 0, it);
      A.renderEditor(); A.changed(true);
      if (kb) $(`#editor [data-id="${it.id}"] .grip`)?.focus();
    });
    colA.append(panel('Layers', [layerList, h('div', { class: 'row' },
      btn('Add layer', () => A.openLibrary('layer'), 'secondary small', 'plus'),
      btn('Add element', () => A.openLibrary('layer', 'Scene elements'), 'ghost small', 'sparkles'))], [], { count: d.layers.length }));

    const fxList = h('div', { class: 'list', role: 'list', 'aria-label': 'Effects, applied top to bottom' });
    if (!d.effects.length) fxList.append(h('div', { class: 'empty' }, icon('fx'), h('span', null, 'Effects run on the finished image, top to bottom: lighting, 3D, distortion, colour.')));
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
    colB.append(s ? settingsPanel(s) : panel('Settings', [h('div', { class: 'empty' }, icon('layers'), h('span', null, 'Select a layer or effect to change it.'))]));
    scheduleThumbs(true);
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
        labeled('Frames per second', seg(FPS, d.fps, (v) => { d.fps = v; setInfo(); A.changed(true); }, 'Frames per second')),
        slider('Loop length', d.duration, { min: 0.4, max: 8, step: 0.1, unit: 's', onInput: (v) => { d.duration = v; setInfo(); A.changed(false); }, onCommit: () => A.commit() }),
        info,
      ], { open: true }),
      group('Recolour everything', A.tweakControls(d.tweak, 'Shifts the colours of the whole paint, after all layers and effects.')),
    ]);
  }

  function listItem(item, kind, list) {
    const isSel = A.state.sel && A.state.sel.id === item.id;
    const def = kind === 'layer' ? PL.LAYERS[item.type] : PL.EFFECTS[item.type];
    const thumb = h('canvas', { class: 'thumb', width: 88, height: 22, 'data-thumb': item.id, 'aria-hidden': 'true' });
    const idx = list.indexOf(item);
    const select_ = () => { if (!(A.state.sel && A.state.sel.id === item.id)) { A.state.sel = { kind, id: item.id }; A.renderEditor(); } };
    // the name is the row's real control: a named button that selects (Enter or Space), F2 or double-click renames, Delete removes
    const nameEl = h('button', { type: 'button', class: 'name', title: 'Double-click or F2 to rename', 'aria-current': isSel ? 'true' : null, 'aria-describedby': null, onclick: () => select_() }, item.name || def.name);
    nameEl.addEventListener('dblclick', () => {
      const inp = h('input', { class: 'field rename', value: item.name || def.name, maxlength: 64, 'aria-label': 'Rename' });
      let finished = false;
      const done = (ok) => { if (finished) return; finished = true; if (ok && inp.value.trim()) { item.name = inp.value.trim(); A.changed(true); } A.renderEditor(); A.focusItem(item.id); };
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); e.stopPropagation(); });
      inp.addEventListener('blur', () => done(true));
      nameEl.replaceWith(inp); inp.focus(); inp.select();
    });
    const meta = [];
    if (kind === 'layer' && item.blend !== 'normal') meta.push((PL.BLENDS.find((b) => b[0] === item.blend) || [, ''])[1].split(' (')[0]);
    if (kind === 'layer' && item.opacity < 1) meta.push(Math.round(item.opacity * 100) + '%');
    const el = h('div', {
      class: 'item sortable-item' + (isSel ? ' sel' : '') + (item.visible ? '' : ' off'), role: 'listitem', 'data-id': item.id,
      onclick: (e) => { if (e.target.closest('button, input')) return; select_(); },
      onkeydown: (e) => {
        if (e.target !== nameEl) return;
        if (e.key === 'F2') { e.preventDefault(); nameEl.dispatchEvent(new MouseEvent('dblclick')); }
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select_(); }
        if (e.key === 'Delete') { e.preventDefault(); remove(); }
      },
    },
    grip(`Move ${item.name || def.name}`), thumb, nameEl,
    meta.length ? h('span', { class: 'meta' }, meta.join(' · ')) : null,
    h('span', { class: 'tools' },
      iconBtn(item.visible ? 'eye' : 'eyeOff', 'Visible', () => { item.visible = !item.visible; A.renderEditor(); A.changed(true); }, { cls: 'sm', attrs: { 'aria-pressed': String(item.visible), 'data-tip': item.visible ? 'Hide' : 'Show' } }),
      iconBtn('dup', 'Duplicate', () => { const c = clone(item); c.id = PL.uid(kind[0]); list.splice(idx + 1, 0, c); A.state.sel = { kind, id: c.id }; A.renderEditor(); A.changed(true); }, { cls: 'sm' }),
      iconBtn('trash', 'Delete', () => remove(), { cls: 'sm danger', attrs: { 'data-hint': 'Delete key' } })));
    function remove() { list.splice(list.indexOf(item), 1); if (isSel) A.state.sel = null; A.renderEditor(); A.changed(true); toast(`Removed ${item.name || def.name}. Ctrl+Z brings it back.`); }
    return el;
  }

  function paramControl(pd, params, onInput, onCommit) {
    const v = params[pd.k];
    switch (pd.t) {
      case 'range': {
        const sl = slider(pd.l, v, { min: pd.min, max: pd.max, step: pd.step, hint: pd.hint, onInput: (x) => { params[pd.k] = x; onInput(); }, onCommit });
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
      case 'palette': return paletteEditor(params[pd.k], (pal, c) => { c ? onCommit() : onInput(); });
      case 'image': {
        const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', class: 'sr-only', onchange: async () => {
          const f = file.files[0]; if (!f) return;
          try { params[pd.k] = await fileToDataUrl(f, 512); await cacheImage(params[pd.k]); onCommit(); A.renderEditor(); }
          catch (e) { toast('Could not read that image.', 'error'); }
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
    const nameIn = h('input', { class: 'field', value: item.name || def.name, 'aria-label': 'Name', 'data-sel-first': '', oninput: () => { item.name = nameIn.value; const n = $(`[data-id="${item.id}"] .name`); if (n) n.textContent = item.name; A.changed(false); }, onchange: () => A.commit() });
    const top = [h('p', { class: 'hint' }, def.desc), labeled('Name', nameIn)];
    if (kind === 'layer') {
      top.push(h('div', { class: 'split' },
        labeled('Blend', select(PL.BLENDS, item.blend, (v) => { item.blend = v; A.renderEditor(); A.changed(true); }, 'Blend')),
        slider('Opacity', item.opacity, { min: 0, max: 1, step: 0.01, scale: 100, unit: '%', decimals: 0, onInput: (v) => { item.opacity = v; onInput(); }, onCommit })));
    }
    const groups = new Map();
    for (const pd of def.params) {
      if (pd.show && !pd.show(item.params)) continue;
      const c = paramControl(pd, item.params, onInput, onCommit);
      if (!c) continue;
      const g = groupOf(pd);
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(c);
    }
    const body = [...top];
    const names = [...groups.keys()].sort((a, b) => (GROUP_ORDER.indexOf(a) + 99) % 99 - (GROUP_ORDER.indexOf(b) + 99) % 99);
    for (const g of names) body.push(group(g, groups.get(g)));
    if (kind === 'layer') {
      const xf = item.xf;
      body.push(group('Move and transform', [
        h('div', { class: 'split' },
          slider('Scale', xf.scale, { min: 0.1, max: 6, step: 0.05, onInput: (v) => { xf.scale = v; onInput(); }, onCommit }),
          slider('Rotate', xf.rotate, { min: -180, max: 180, step: 1, unit: '°', onInput: (v) => { xf.rotate = v; onInput(); }, onCommit }),
          slider('Offset x', xf.ox, { min: -1, max: 1, step: 0.01, onInput: (v) => { xf.ox = v; onInput(); }, onCommit }),
          slider('Offset y', xf.oy, { min: -1, max: 1, step: 0.01, onInput: (v) => { xf.oy = v; onInput(); }, onCommit }),
          slider('Scroll x', xf.sx, { min: -8, max: 8, step: 1, hint: 'Full widths per loop', onInput: (v) => { xf.sx = v; onInput(); }, onCommit }),
          slider('Scroll y', xf.sy, { min: -8, max: 8, step: 1, hint: 'Full heights per loop', onInput: (v) => { xf.sy = v; onInput(); }, onCommit }),
          slider('Spin', xf.spin, { min: -8, max: 8, step: 1, hint: 'Turns per loop', onInput: (v) => { xf.spin = v; onInput(); }, onCommit })),
        checkbox('Wrap around the edges when moved', xf.tile, (v) => { xf.tile = v; onCommit(); }),
        h('p', { class: 'hint' }, 'Moves the whole layer. Scroll and spin use whole numbers so the loop stays seamless.')]));
      item.tweak = Object.assign({}, E.DEFAULT_TWEAK, item.tweak || {});
      body.push(group('Colour tweaks', A.tweakControls(item.tweak, 'Shift the colours of just this layer.')));
    }
    const hasXY = def.params.some((pd) => pd.k === 'x') || def.params.some((pd) => pd.k === 'cx' && /^Centre/.test(pd.l));
    if (hasXY) body.splice(2, 0, h('p', { class: 'hint drag-hint' }, icon('move'), 'Drag on the paint image to move it.'));
    const reset = iconBtn('reset', 'Reset to defaults', () => { item.params = E.defaults(def); if (item.xf) item.xf = Object.assign({}, E.DEFAULT_XF); if (item.tweak) item.tweak = Object.assign({}, E.DEFAULT_TWEAK); A.renderEditor(); A.changed(true); }, { cls: 'sm' });
    const dup = iconBtn('dup', 'Duplicate', () => { const list = s.list, c = clone(item); c.id = PL.uid(kind[0]); list.splice(list.indexOf(item) + 1, 0, c); A.state.sel = { kind, id: c.id }; A.renderEditor(); A.changed(true); }, { cls: 'sm' });
    // One toggle: collapses every group while any is open, expands them all once all are closed.
    const heads = () => [...sec.querySelectorAll('.ghead')];
    const anyOpen = () => heads().some((hd) => hd.getAttribute('aria-expanded') === 'true');
    const toggleAll = iconBtn('collapse', 'Collapse all groups', () => {
      const open = !anyOpen();
      for (const hd of heads()) if ((hd.getAttribute('aria-expanded') === 'true') !== open) hd.click();
      syncToggle();
    }, { cls: 'sm' });
    const syncToggle = () => {
      const label = anyOpen() ? 'Collapse all groups' : 'Expand all groups';
      toggleAll.replaceChildren(icon(anyOpen() ? 'collapse' : 'expand'));
      toggleAll.setAttribute('aria-label', label); toggleAll.dataset.tip = label;
    };
    const sec = panel((kind === 'layer' ? (def.draw ? 'Element: ' : 'Layer: ') : 'Effect: ') + (item.name || def.name), body, [toggleAll, dup, reset], { id: 'settingsPanel', key: 'settings' });
    sec.addEventListener('click', (e) => { if (e.target.closest('.ghead')) syncToggle(); }); // single groups change it too
    syncToggle();
    return sec;
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
    const srcs = doc.layers.filter((l) => l.type === 'image' && l.params.src).map((l) => l.params.src);
    await Promise.all(srcs.map((s) => cacheImage(s).catch(() => {})));
    if (srcs.length) { A.rt.dirty = true; scheduleThumbs(true); }
  }

  // ---- thumbnails ----
  let thumbTimer = 0;
  function scheduleThumbs(now) { clearTimeout(thumbTimer); thumbTimer = setTimeout(drawThumbs, now ? 0 : 250); }
  function drawThumbs() {
    if (A.state.mode !== 'anim') return;
    const d = A.state.anim, t = 0.15;
    for (const cv of document.querySelectorAll('[data-thumb]')) {
      const id = cv.dataset.thumb;
      const l = d.layers.find((x) => x.id === id), e = d.effects.find((x) => x.id === id);
      let mini;
      if (l) mini = Object.assign({}, d, { layers: [Object.assign({}, l, { visible: true, opacity: 1, blend: 'normal' })], effects: [] });
      else if (e) mini = Object.assign({}, d, { effects: [Object.assign({}, e, { visible: true })] });
      else continue;
      const cp = E.compile(mini);
      // render at the paint's aspect, then letterbox into the thumb
      const W = 88, H = Math.max(4, Math.round(88 / (d.width / d.height)));
      const img = E.toImageData(E.renderBuf(cp, t, W, H), W, H);
      const tmp = h('canvas', { width: W, height: H }); tmp.getContext('2d').putImageData(img, 0, 0);
      const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.drawImage(tmp, 0, 0, cv.width, cv.height); // stretched, the way 7TV stretches it over a name
    }
  }

  Object.assign(A, { findSel, renderAnimEditor, settingsPanel, fileToDataUrl, cacheImage, cacheDocImages, scheduleThumbs });
})(window.PL);
