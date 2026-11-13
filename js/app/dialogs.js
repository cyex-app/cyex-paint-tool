/* cyex paints: library and presets dialogs. */
(function (PL) {
  'use strict';
  const { h, icon, iconBtn, btn, seg, dialog, toast } = PL.UI;
  const E = PL.Engine, Paint = PL.Paint, clone = PL.clone;
  const A = (PL.App = PL.App || {});

  // =====================================================================================
  // Library and presets dialogs
  // =====================================================================================
  let libCat = { layer: 'All', effect: 'All' };
  function openLibrary(kind, startCat) {
    const defs = kind === 'layer' ? PL.LAYERS : PL.EFFECTS, cats = kind === 'layer' ? PL.LAYER_CATS : PL.EFFECT_CATS;
    if (startCat) libCat[kind] = startCat;
    const search = h('input', { class: 'field', placeholder: 'Search…', 'aria-label': 'Search the library', autofocus: true });
    const list = h('div', { class: 'stack libmain' });
    const nav = h('nav', { class: 'libnav', 'aria-label': 'Categories' });
    const renderNav = () => {
      nav.textContent = '';
      for (const c of ['All', ...cats]) {
        const n = c === 'All' ? Object.keys(defs).length : Object.values(defs).filter((d) => d.cat === c).length;
        nav.append(h('button', { type: 'button', class: 'navitem', 'aria-current': String(libCat[kind] === c), onclick: () => { libCat[kind] = c; renderNav(); render(); } }, h('span', null, c), h('span', { class: 'gcount' }, n)));
      }
    };
    const thumbs = [];
    const render = () => {
      const q = search.value.trim().toLowerCase();
      list.textContent = ''; thumbs.length = 0;
      for (const cat of cats) {
        if (!q && libCat[kind] !== 'All' && libCat[kind] !== cat) continue;
        const items = Object.values(defs).filter((d) => d.cat === cat && (!q || (d.name + ' ' + d.desc + ' ' + cat).toLowerCase().includes(q)));
        if (!items.length) continue;
        list.append(h('div', { class: 'libcat' }, h('h3', { class: 'label' }, cat), h('div', { class: 'cards' }, items.map((def) => {
          const cv = h('canvas', { width: 160, height: 40, 'aria-hidden': 'true' });
          thumbs.push([cv, def]);
          return h('button', { type: 'button', class: 'card', onclick: () => add(def) }, cv, h('b', null, def.name), h('span', null, def.desc));
        }))));
      }
      if (!list.children.length) list.append(h('div', { class: 'empty' }, icon('search'), h('span', null, 'Nothing matches that search.')));
      drawLibThumbs(kind, thumbs);
    };
    search.addEventListener('input', render);
    search.addEventListener('keydown', (e) => { if (e.key === 'Escape' && search.value) { e.stopPropagation(); search.value = ''; render(); } });
    const add = (def) => {
      const d = A.state.anim;
      if (kind === 'layer') {
        const l = E.newLayer(def.id);
        if (d.layers.length && ['sparkles', 'stars', 'shine', 'glints', 'particles', 'rays'].includes(def.id)) l.blend = 'screen';
        d.layers.push(l); A.state.sel = { kind, id: l.id };
      } else { const e = E.newEffect(def.id); d.effects.push(e); A.state.sel = { kind, id: e.id }; }
      dlg.close(); A.renderEditor(); A.changed(true); A.focusItem(A.state.sel.id);
      toast(`Added ${def.name}.${def.cat === 'Scene elements' ? ' Drag on the paint image to place it.' : ''}`);
    };
    const dlg = dialog(kind === 'layer' ? 'Add a layer or element' : 'Add an effect', [h('div', { class: 'search' }, icon('search'), search), h('div', { class: 'libwrap' }, nav, list)], { wide: true });
    renderNav(); render();
  }
  let libJob = 0;
  function drawLibThumbs(kind, thumbs) {
    const job = ++libJob;
    const base = [E.newLayer('linear', { params: { stops: PL.clone(PL.PALETTES.sunset), angle: 90, speed: 0 } }), E.newLayer('clouds', { params: { stops: PL.clone(PL.PALETTES.mono) }, blend: 'overlay', opacity: 0.7 })];
    let i = 0;
    const step = () => {
      if (job !== libJob) return;
      const t0 = performance.now();
      while (i < thumbs.length && performance.now() - t0 < 12) {
        const [cv, def] = thumbs[i++];
        const doc = Object.assign(E.blankDoc(), { width: 160, height: 40 });
        if (kind === 'layer') doc.layers = [E.newLayer(def.id)];
        else { doc.layers = base; doc.effects = [E.newEffect(def.id)]; }
        cv.getContext('2d').putImageData(E.renderFrame(E.compile(doc), 3), 0, 0);
      }
      if (i < thumbs.length) setTimeout(step, 0);
    };
    setTimeout(step, 30);
  }

  function openPresets() {
    let tab = A.state.mode;
    const host = h('div', { class: 'cards' });
    if (tab === 'anim') tab = 'scenes';
    const tabs = seg([['static', 'Static gradients'], ['scenes', 'Scenes'], ['anim', 'Animated effects']], tab, (v) => { tab = v; hideSur(); render(); }, 'Preset type');
    let job = 0;
    const render = () => {
      host.textContent = '';
      const my = ++job;
      if (tab === 'static') {
        for (const p of PL.STATIC_PRESETS) {
          const sw = h('div', { class: 'sw', style: { backgroundImage: Paint.gradientCss(p) } });
          host.append(h('button', { type: 'button', class: 'card', onclick: () => { A.state.static = clone(p); A.state.mode = 'static'; d.close(); A.renderAll(); A.commit(); } }, sw, h('b', null, p.name), h('span', null, `${p.function === 'RADIAL_GRADIENT' ? 'Radial' : 'Linear'} · ${p.stops.length} stops${p.shadows.length ? ' · shadow' : ''}`)));
        }
      } else {
        const work = [];
        for (const make of (tab === 'scenes' ? PL.ANIM_PRESETS.slice(0, PL.SCENE_COUNT) : PL.ANIM_PRESETS.slice(PL.SCENE_COUNT))) {
          const doc = make();
          const cv = h('canvas', { width: 192, height: 48, 'aria-hidden': 'true' });
          work.push([cv, doc]);
          host.append(h('button', { type: 'button', class: 'card', onclick: () => { A.state.anim = make(); A.state.mode = 'anim'; A.state.sel = null; d.close(); A.renderAll(); A.commit(); } }, cv, h('b', null, doc.name), h('span', null, doc.layers.map((l) => PL.LAYERS[l.type].name).concat(doc.effects.map((e) => PL.EFFECTS[e.type].name)).join(', '))));
        }
        let i = 0;
        const step = () => {
          if (my !== job) return;
          const t0 = performance.now();
          while (i < work.length && performance.now() - t0 < 14) {
            const [cv, doc] = work[i++];
            doc.width = 192; doc.height = 48;
            cv.getContext('2d').putImageData(E.renderFrame(E.compile(doc), Math.floor(E.frameCount(doc) * 0.3)), 0, 0);
          }
          if (i < work.length) setTimeout(step, 0);
        };
        setTimeout(step, 30);
      }
    };
    // ---- Surprise me: a random paint for the current tab, previewed before it replaces anything ----
    // The card's nodes are built once and reused, so rolling never moves focus and the live region keeps announcing.
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let paused = reduced, player = null, sur = null, lastRoll = 0;
    const surLive = h('span', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
    const swatch = h('div', { class: 'sw', 'aria-hidden': 'true', hidden: true });
    const cv = h('canvas', { width: 256, height: 64, 'aria-hidden': 'true', hidden: true });
    const sname = h('b', { class: 'sname' }), smeta = h('span');
    const pauseB = iconBtn('pause', 'Pause preview', () => { paused = !paused; syncPause(); if (player) player.setPaused(paused); }, { cls: 'sm spause' });
    const syncPause = () => { pauseB.setAttribute('aria-pressed', String(paused)); pauseB.replaceChildren(icon(paused ? 'play' : 'pause')); };
    syncPause();
    const useB = btn('Use this', () => use(), 'primary small');
    const againB = btn('Another', () => roll(), 'secondary small', 'dice');
    const surWrap = h('div', { class: 'surprise', hidden: true, role: 'group', 'aria-label': 'Surprise preview' },
      h('div', { class: 'sprev' }, swatch, cv, pauseB),
      h('div', { class: 'sinfo' }, sname, smeta),
      h('div', { class: 'sact' }, useB, againB, h('span', { class: 'hint' }, 'Press R for another.')));
    const kindOfTab = () => (tab === 'static' ? 'static' : 'anim');
    const stopPreview = () => { if (player) { player.stop(); player = null; } };
    const hideSur = () => { stopPreview(); sur = null; surWrap.hidden = true; surLive.textContent = ''; };
    const roll = () => {
      const S = PL.Surprise;
      if (!S) { toast('Surprise me isn’t available.', 'error'); return; }
      const now = performance.now();
      if (now - lastRoll < 150) return;
      lastRoll = now;
      const kind = kindOfTab();
      let item;
      try { item = kind === 'static' ? S.makeStatic() : S.make(); }
      catch (e) { toast('Couldn’t make a paint just now. Try again.', 'error'); return; }
      stopPreview();
      sur = { kind, item };
      sname.textContent = item.name;
      swatch.hidden = kind !== 'static'; cv.hidden = kind === 'static'; pauseB.hidden = kind === 'static';
      if (kind === 'static') {
        swatch.style.backgroundImage = Paint.gradientCss(item);
        smeta.textContent = `${item.function === 'RADIAL_GRADIENT' ? 'Radial' : 'Linear'} · ${item.stops.length} stops${item.repeat ? ' · repeating' : ''}${item.shadows.length ? ' · shadow' : ''}`;
      } else {
        smeta.textContent = item.layers.map((l) => PL.LAYERS[l.type].name).concat(item.effects.map((e) => PL.EFFECTS[e.type].name)).join(', ');
        player = playPreview(cv, item, paused);
      }
      surWrap.hidden = false;
      surLive.textContent = `${item.name}, ${kind === 'static' ? 'static gradient' : 'animated paint'}`;
    };
    const use = () => {
      if (!sur) return;
      if (sur.kind === 'static') { A.state.static = clone(sur.item); A.state.mode = 'static'; }
      else { A.state.anim = clone(sur.item); A.state.mode = 'anim'; }
      A.state.sel = null;
      stopPreview(); d.close(); A.renderAll(); A.commit();
    };
    const surBtn = btn('Surprise me', () => roll(), 'secondary small', 'dice');
    surBtn.dataset.tip = 'Make a random paint for this tab'; surBtn.dataset.hint = 'Press R for another';
    const d = dialog('Presets', [h('div', { class: 'row' }, tabs, surBtn, h('span', { class: 'hint' }, 'Picking a preset replaces the current paint of that type. Undo brings it back.')), surLive, surWrap, host], { wide: true, onClose: () => stopPreview() });
    if (!d.box.dataset.surprise) d.box.addEventListener('keydown', (e) => { // a second open of the dialog reuses the first, so bind once
      if (e.key.toLowerCase() !== 'r' || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || e.defaultPrevented) return;
      if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
      e.preventDefault();
      if (!e.repeat) roll();
    });
    d.box.dataset.surprise = "1";
    render();
  }

  // Plays a document on a canvas, a frame at a time (every second frame, cached after the first pass).
  // One requestAnimationFrame loop with a time gate; it idles while paused, while the tab is hidden and while the
  // canvas is off screen. Starts paused (a still frame) when asked to, e.g. under reduced motion.
  // Returns { stop, setPaused }.
  function playPreview(cv, doc, startPaused) {
    let raf = 0, last = 0, i = 0, n = 1, gap = 100, visible = true, alive = true, paused = !!startPaused, io = null, draw = () => {};
    const stop = () => {
      alive = false; cancelAnimationFrame(raf); raf = 0;
      document.removeEventListener('visibilitychange', kick);
      if (io) { io.disconnect(); io = null; }
    };
    function kick() {
      if (!alive || raf || paused || document.hidden || !visible) return;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    }
    function tick(now) {
      raf = 0;
      if (!alive) return;
      if (!cv.isConnected) { stop(); return; }
      if (paused || document.hidden || !visible) return; // kick() restarts it
      if (now - last >= gap) {
        last = now;
        try { i = (i + 2) % n; draw(i); } catch (e) { stop(); return; }
      }
      raf = requestAnimationFrame(tick);
    }
    try {
      const d = Object.assign({}, doc, { width: 256, height: 64 }), cp = E.compile(d), ctx = cv.getContext('2d'), cache = [];
      n = E.frameCount(d); gap = 2000 / d.fps;
      draw = (k) => { if (!cache[k]) cache[k] = E.renderFrame(cp, k); ctx.putImageData(cache[k], 0, 0); };
      draw(Math.floor(n * 0.3));
      document.addEventListener('visibilitychange', kick);
      if (typeof IntersectionObserver === 'function') {
        io = new IntersectionObserver((es) => { visible = es[es.length - 1].isIntersecting; if (visible) kick(); });
        io.observe(cv);
      }
      kick();
    } catch (e) { stop(); }
    return { stop, setPaused: (p) => { paused = !!p; if (paused) { cancelAnimationFrame(raf); raf = 0; } else kick(); } };
  }

  Object.assign(A, { openLibrary, openPresets });
})(window.PL);
