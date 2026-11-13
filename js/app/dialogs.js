/* cyex paints: library and presets dialogs. */
(function (PL) {
  'use strict';
  const { h, icon, seg, dialog, toast } = PL.UI;
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
        list.append(h('div', { class: 'libcat' }, h('span', { class: 'label' }, cat), h('div', { class: 'cards' }, items.map((def) => {
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
    const tabs = seg([['static', 'Static gradients'], ['scenes', 'Scenes'], ['anim', 'Animated effects']], tab, (v) => { tab = v; render(); }, 'Preset type');
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
    const d = dialog('Presets', [h('div', { class: 'row' }, tabs, h('span', { class: 'hint' }, 'Picking a preset replaces the current paint of that type. Undo brings it back.')), host], { wide: true });
    render();
  }

  Object.assign(A, { openLibrary, openPresets });
})(window.PL);
