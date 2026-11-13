/* cyex paints: library and presets dialogs. */
(function (PL) {
  'use strict';
  const { h, icon, iconBtn, btn, seg, dialog, toast } = PL.UI;
  const E = PL.Engine, Paint = PL.Paint, clone = PL.clone;
  const A = (PL.App = PL.App || {});

  // =====================================================================================
  // Library and presets dialogs
  // =====================================================================================
  // The library: built-in layers or effects grouped by category, My library (userlib.js) first, a
  // search that ranks across all of them (search.js), and "Similar" on every card.
  const MINE = 'My library';
  let libCat = { layer: 'All', effect: 'All' };
  function openLibrary(kind, startCat) {
    const defs = kind === 'layer' ? PL.LAYERS : PL.EFFECTS, cats = kind === 'layer' ? PL.LAYER_CATS : PL.EFFECT_CATS;
    const U = A.userLib, S = A.Search;
    if (startCat) libCat[kind] = startCat;
    const builtins = Object.values(defs).filter((d) => !d.custom && cats.includes(d.cat)).map((d) => ({ key: kind[0].toUpperCase() + ':' + d.id, kind, name: d.name, cat: d.cat, desc: d.desc, tags: d.tags || [], def: d }));
    let mine = U ? U.entries(kind) : [];
    const all = () => mine.concat(builtins);
    let similarTo = null;
    const search = h('input', { class: 'field', placeholder: 'Search by name, look or feel, e.g. shiny metal, water, retro…', 'aria-label': 'Search the library', autofocus: true });
    const list = h('div', { class: 'stack libmain' });
    const nav = h('nav', { class: 'libnav', 'aria-label': 'Categories' });
    const live = h('span', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
    const renderNav = () => {
      nav.textContent = '';
      const counts = [[MINE, mine.length], ['All', builtins.length], ...cats.map((c) => [c, builtins.filter((e) => e.cat === c).length])].filter(([c, n]) => n || c === MINE || c === 'All');
      for (const [c, n] of counts) {
        nav.append(h('button', { type: 'button', class: 'navitem' + (c === MINE ? ' mine' : ''), 'aria-current': String(libCat[kind] === c && !search.value.trim() && !similarTo), onclick: () => { libCat[kind] = c; similarTo = null; search.value = ''; renderNav(); render(); list.scrollTop = 0; } }, c === MINE ? icon('bookmark') : null, h('span', null, c), h('span', { class: 'gcount' }, n)));
      }
    };
    const thumbs = [];
    // one card: add on click; Similar (and for your own items, edit and remove) beside it
    const card = (e, showCat) => {
      const cv = h('canvas', { width: 160, height: 40, 'aria-hidden': 'true' });
      thumbs.push([cv, e]);
      const main = h('button', { type: 'button', class: 'card', onclick: () => add(e) }, cv, h('b', null, e.name), h('span', null, showCat ? `${e.cat} · ${e.desc}` : e.desc));
      const tools = [iconBtn('search', `Similar to ${e.name}`, () => { similarTo = e; search.value = ''; renderNav(); render(); list.scrollTop = 0; }, { cls: 'sm' })];
      if (e.user) {
        if (e.user.type === 'code') tools.push(iconBtn('code', `Edit ${e.name}`, () => U.openCodeEditor(e.user.kind, e.user, { onSaved: refresh }), { cls: 'sm' }));
        tools.push(removeBtn(e));
      }
      return h('div', { class: 'cardwrap' }, main, h('div', { class: 'cardtools' }, tools), e.badge ? h('span', { class: 'badge' }, e.badge) : null);
    };
    // remove: the first press arms it ("Press again to remove"), the second removes; leaving disarms
    const removeBtn = (e) => {
      const b = iconBtn('trash', `Remove ${e.name} from My library`, () => {
        if (b.dataset.armed) { U.remove(e.user); toast(`Removed ${e.name} from My library.`); refresh(); return; }
        b.dataset.armed = '1'; b.classList.add('armed'); b.setAttribute('aria-label', `Press again to remove ${e.name}`); b.dataset.tip = 'Press again to remove';
      }, { cls: 'sm danger' });
      const disarm = () => { delete b.dataset.armed; b.classList.remove('armed'); b.setAttribute('aria-label', `Remove ${e.name} from My library`); b.dataset.tip = `Remove ${e.name} from My library`; };
      b.addEventListener('blur', disarm); b.addEventListener('pointerleave', disarm);
      return b;
    };
    const section = (title, entries, showCat, extra) => h('div', { class: 'libcat' }, h('div', { class: 'libhead' }, h('h3', { class: 'label' }, title), extra || null), h('div', { class: 'cards' }, entries.map((e) => card(e, showCat))));
    // My library tools: pictures (layers only), new code, import and export
    const mineTools = () => {
      const pics = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', multiple: true, class: 'sr-only', onchange: async () => { await U.addImageFiles(pics.files); pics.value = ''; refresh(); } });
      const imp = h('input', { type: 'file', accept: '.json,application/json', class: 'sr-only', onchange: async () => { if (imp.files[0]) await U.importLibrary(imp.files[0], refresh); imp.value = ''; } });
      return h('div', { class: 'row libtools' },
        kind === 'layer' ? h('label', { class: 'btn secondary small' }, icon('image'), 'Upload pictures', pics) : null,
        btn(kind === 'layer' ? 'New code layer' : 'New code effect', () => U.openCodeEditor(kind, null, { onSaved: refresh }), 'secondary small', 'code'),
        h('label', { class: 'btn ghost small' }, icon('upload'), 'Import', imp),
        btn('Export', () => U.exportLibrary(), 'ghost small', 'download'));
    };
    const render = () => {
      const q = search.value.trim();
      list.textContent = ''; thumbs.length = 0;
      if (similarTo) {
        const res = S.similar(all(), similarTo);
        list.append(h('div', { class: 'libchip' }, h('span', null, 'Similar to ', h('b', null, similarTo.name)), btn('Clear', () => { similarTo = null; renderNav(); render(); search.focus(); }, 'ghost small', 'x')));
        list.append(res.length ? section(`${res.length} similar`, res, true) : h('div', { class: 'empty' }, icon('search'), h('span', null, 'Nothing else looks much like it.')));
        live.textContent = `${res.length} similar to ${similarTo.name}`;
      } else if (q) {
        const res = S.search(all(), q);
        if (res.length) list.append(section(`${res.length} match${res.length === 1 ? '' : 'es'}, best first`, res, true));
        else list.append(h('div', { class: 'empty' }, icon('search'), h('span', null, 'Nothing matches that search. Try another word, like a colour, a material or a mood.')));
        live.textContent = res.length ? `${res.length} matches` : 'No matches';
      } else if (libCat[kind] === MINE) {
        const intro = kind === 'layer' ? 'Your own layers: pictures you upload, layers you saved with “Save to My library” in their settings, and code you write.' : 'Your own effects: effects you saved with “Save to My library” in their settings, and code you write.';
        list.append(h('div', { class: 'libcat' }, h('p', { class: 'hint' }, intro, ' They stay in this browser; Export makes a file you can back up or share.'), mineTools()));
        if (mine.length) list.append(section(MINE, mine, false));
        else list.append(h('div', { class: 'empty' }, icon('bookmark'), h('span', null, 'Nothing saved yet.')));
      } else {
        if (libCat[kind] === 'All' && mine.length) list.append(section(MINE, mine, false));
        for (const cat of cats) {
          if (libCat[kind] !== 'All' && libCat[kind] !== cat) continue;
          const es = builtins.filter((e) => e.cat === cat);
          if (es.length) list.append(section(cat, es, false));
        }
      }
      drawLibThumbs(kind, thumbs);
    };
    const refresh = () => { mine = U ? U.entries(kind) : []; renderNav(); render(); };
    let typing = 0;
    search.addEventListener('input', () => { similarTo = null; clearTimeout(typing); typing = setTimeout(() => { renderNav(); render(); list.scrollTop = 0; }, 90); });
    search.addEventListener('keydown', (e) => { if (e.key === 'Escape' && search.value) { e.stopPropagation(); search.value = ''; renderNav(); render(); } });
    const add = (e) => {
      if (e.user) { if (U.add(e.user)) dlg.close(); return; }
      const def = e.def, d = A.state.anim;
      if (kind === 'layer') {
        const l = E.newLayer(def.id);
        if (d.layers.length && ['sparkles', 'stars', 'shine', 'glints', 'particles', 'rays'].includes(def.id)) l.blend = 'screen';
        d.layers.push(l); A.state.sel = { kind, id: l.id };
      } else { const ef = E.newEffect(def.id); d.effects.push(ef); A.state.sel = { kind, id: ef.id }; }
      dlg.close(); A.renderEditor(); A.changed(true); A.focusItem(A.state.sel.id);
      toast(`Added ${def.name}.${def.cat === 'Scene elements' ? ' Drag on the paint image to place it.' : ''}`);
    };
    const total = builtins.length + mine.length;
    const dlg = dialog(kind === 'layer' ? 'Add a layer or element' : 'Add an effect', [h('div', { class: 'search' }, icon('search'), search), h('p', { class: 'hint libcount' }, `${PL.fmtInt(total)} ${kind === 'layer' ? 'layers' : 'effects'}. The search also finds similar words and typos.`), live, h('div', { class: 'libwrap' }, nav, list)], { wide: true });
    renderNav(); render();
  }
  let libJob = 0;
  function drawLibThumbs(kind, thumbs) {
    const job = ++libJob;
    const base = () => [E.newLayer('linear', { params: { stops: PL.clone(PL.PALETTES.sunset), angle: 90, speed: 0 } }), E.newLayer('clouds', { params: { stops: PL.clone(PL.PALETTES.mono) }, blend: 'overlay', opacity: 0.7 })];
    let i = 0;
    const step = () => {
      if (job !== libJob) return;
      const t0 = performance.now();
      while (i < thumbs.length && performance.now() - t0 < 12) {
        const [cv, e] = thumbs[i++];
        if (!cv.isConnected) continue;
        try {
          if (e.user && e.user.type === 'image') { drawPicture(cv, e.user.data.src); continue; }
          let doc;
          if (e.user) doc = A.userLib.previewDoc(e.user, base);
          else { doc = E.blankDoc(); if (kind === 'layer') doc.layers = [E.newLayer(e.def.id)]; else { doc.layers = base(); doc.effects = [E.newEffect(e.def.id)]; } }
          Object.assign(doc, { width: 160, height: 40 });
          cv.getContext('2d').putImageData(E.renderFrame(E.compile(doc), 3), 0, 0);
        } catch (_) { /* a broken item keeps a blank thumbnail */ }
      }
      if (i < thumbs.length) setTimeout(step, 0);
    };
    setTimeout(step, 30);
  }
  function drawPicture(cv, src) {
    const im = new Image();
    im.onload = () => { const c = cv.getContext('2d'), k = Math.max(cv.width / im.width, cv.height / im.height); c.drawImage(im, (cv.width - im.width * k) / 2, (cv.height - im.height * k) / 2, im.width * k, im.height * k); };
    im.src = src;
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
