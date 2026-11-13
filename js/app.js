/* cyex paints: editor wiring for static (7TV gradient) and animated (layered, exported as image) paints. */
(function (PL) {
  'use strict';
  const { h, icon, iconBtn, btn, panel, slider, seg, checkbox, labeled, select, colorField, stopsEditor, paletteEditor, sortable, grip, group, dialog, toast, download, copyText, slug } = PL.UI;
  const E = PL.Engine, Paint = PL.Paint, clone = PL.clone;
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
  let pendingNotice = null;
  function healDoc(doc, quiet) {
    const { doc: d, dropped } = E.sanitizeDoc(doc);
    if (dropped && !quiet) toastLater(`Skipped ${dropped} layer${dropped > 1 ? 's' : ''} this version doesn't know.`);
    return d;
  }
  function toastLater(msg, kind = 'info') { if (typeof toast === 'function' && document.getElementById('toasts')) toast(msg, kind); else pendingNotice = [msg, kind]; }
  let state = defaultState();
  try {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (_) { raw = null; } // storage blocked: nothing saved, not broken
    const saved = JSON.parse(raw || 'null');
    if (saved && saved.static && saved.anim) {
      const next = Object.assign(defaultState(), saved);
      next.anim = healDoc(next.anim, true);
      next.static = Paint.normalize(next.static);
      E.compile(next.anim); // throws here, not on every frame, if something is still wrong
      state = next;
    }
  } catch (e) {
    // a broken saved state must not brick the app: keep a copy and start fresh
    try { localStorage.setItem(KEY + '.broken', localStorage.getItem(KEY) || ''); } catch (_) {}
    state = defaultState();
    pendingNotice = ['Your last saved paint couldn’t be loaded, so a fresh one is open. A copy was kept in this browser.', 'error'];
  }
  state.anim = healDoc(state.anim, true);
  state.static = Paint.normalize(state.static);

  // One place that opens any JSON: a 7TV paint, or a cyex paints project.
  function loadJson(obj) {
    if (obj && obj.cyexPaintProject) {
      state.anim = healDoc(obj.doc); state.mode = 'anim'; state.sel = null;
      cacheDocImages(state.anim);
      return 'Project opened.';
    }
    const res = Paint.normalize(obj, true);
    state.static = res.paint; state.mode = 'static';
    return res.warnings.length ? 'Paint imported. ' + res.warnings.join(' ') : 'Paint imported.';
  }

  let saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); }
      catch (e) { // images can blow the quota; save without them
        try { const s = clone(state); s.anim.layers.forEach((l) => { if (l.params && l.params.src) l.params.src = ''; }); localStorage.setItem(KEY, JSON.stringify(s)); } catch (_) {}
      }
    }, 300);
  }

  const snap = () => JSON.stringify({ mode: state.mode, static: state.static, anim: state.anim });
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
    const o = JSON.parse(s);
    state.mode = o.mode; state.static = o.static; state.anim = o.anim;
    hist.last = s;
    renderAll(); save(); updateUndo();
  }
  const undo = () => { if (!hist.past.length) return; commit(); if (!hist.past.length) return; hist.future.push(hist.last); restore(hist.past.pop()); };
  const redo = () => { commit(); if (!hist.future.length) return; hist.past.push(hist.last); restore(hist.future.pop()); };
  function updateUndo() { $('#undoBtn').disabled = !hist.past.length; $('#redoBtn').disabled = !hist.future.length; }

  // Every edit calls changed(); commit=true for discrete actions, sliders commit on release.
  function changed(doCommit) {
    if (state.mode === 'anim') { rt.dirty = true; scheduleThumbs(); }
    else updateStaticPreview();
    updateOutput();
    save();
    clearTimeout(commitTimer);
    if (doCommit) commit(); else commitTimer = setTimeout(commit, 700);
  }

  const $ = (s, r = document) => r.querySelector(s);

  // =====================================================================================
  // Header
  // =====================================================================================
  const modeSeg = seg([['static', 'Static'], ['anim', 'Animated']], state.mode, (m) => { state.mode = m; renderAll(); commit(); }, 'Paint type');
  $('#modeSeg').replaceWith(Object.assign(modeSeg, { id: 'modeSeg' }));
  $('#undoBtn').append(icon('undo')); $('#undoBtn').onclick = undo;
  $('#redoBtn').append(icon('redo')); $('#redoBtn').onclick = redo;
  $('#presetsBtn').append(icon('sparkles'), h('span', { class: 'lbl' }, 'Presets'));
  $('#presetsBtn').onclick = openPresets;
  const themeBtn = $('#themeBtn');
  const paintTheme = () => { themeBtn.textContent = ''; themeBtn.append(icon(document.documentElement.dataset.theme === 'light' ? 'moon' : 'sun')); };
  themeBtn.onclick = () => {
    const go = () => {
      const light = document.documentElement.dataset.theme !== 'light';
      if (light) document.documentElement.dataset.theme = 'light'; else delete document.documentElement.dataset.theme;
      try { localStorage.setItem('cyexTheme', light ? 'light' : 'dark'); } catch (e) {}
      $('meta[name="theme-color"]').content = light ? '#f3f3f4' : '#1e1f23';
      paintTheme();
    };
    if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(go); else go();
  };
  paintTheme();

  document.addEventListener('keydown', (e) => {
    const typing = e.target.closest && e.target.closest('input, textarea, [contenteditable]');
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y' && !typing) { e.preventDefault(); redo(); }
    else if (e.key === ' ' && !e.defaultPrevented && state.mode === 'anim' && !typing && !e.target.closest('button, [role="radio"], [role="listbox"], .item, .backdrop')) { e.preventDefault(); togglePlay(); }
  });

  // =====================================================================================
  // Painted-name rendering (canvas), matching the 7TV extension:
  // background-color: currentcolor; background-image stretched to the name box; clipped to text;
  // filter: drop-shadow(...) for each shadow.
  // =====================================================================================
  const NAME_FONT = getComputedStyle(document.documentElement).getPropertyValue('--name-font').trim() || 'system-ui, sans-serif';
  const mctx = document.createElement('canvas').getContext('2d');
  function measure(text, px) {
    mctx.font = `700 ${px}px ${NAME_FONT}`;
    const m = mctx.measureText(text || ' ');
    const asc = m.fontBoundingBoxAscent ?? px * 0.95, desc = m.fontBoundingBoxDescent ?? px * 0.25;
    return { w: Math.max(1, Math.ceil(m.width)), asc, desc, h: Math.ceil(asc + desc) };
  }
  const shadowFilter = (shadows, k = 1) => (shadows && shadows.length ? shadows.map((s) => `drop-shadow(${s.x_offset * k}px ${s.y_offset * k}px ${s.radius * k}px ${PL.decToCss(s.color)})`).join(' ') : 'none');
  const off = document.createElement('canvas'), offCtx = off.getContext('2d');
  function shadowPad(shadows) { let p = 2; for (const s of shadows || []) p = Math.max(p, Math.abs(s.x_offset) + s.radius * 2 + 2, Math.abs(s.y_offset) + s.radius * 2 + 2); return Math.ceil(p); }

  // Draw a painted name into ctx at (x, y) in device pixels; tex is a canvas or image (the paint).
  function paintName(ctx, x, y, text, px, tex, color, shadows, k) {
    const m = measure(text, px);
    const w = Math.ceil(m.w * k), hh = Math.ceil(m.h * k);
    if (off.width < w || off.height < hh) { off.width = Math.max(off.width, w); off.height = Math.max(off.height, hh); }
    offCtx.globalCompositeOperation = 'source-over';
    offCtx.clearRect(0, 0, off.width, off.height);
    offCtx.fillStyle = color; offCtx.fillRect(0, 0, w, hh);
    if (tex) { offCtx.imageSmoothingEnabled = true; offCtx.imageSmoothingQuality = 'high'; offCtx.drawImage(tex, 0, 0, w, hh); }
    offCtx.globalCompositeOperation = 'destination-in';
    offCtx.font = `700 ${px * k}px ${NAME_FONT}`; offCtx.textBaseline = 'alphabetic'; offCtx.fillStyle = '#000';
    offCtx.fillText(text, 0, m.asc * k);
    offCtx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.filter = shadowFilter(shadows, k);
    ctx.drawImage(off, 0, 0, w, hh, x, y, w, hh);
    ctx.restore();
    return { w, h: hh };
  }
  // Size a canvas to hold one painted name and draw it.
  function drawNameCanvas(cv, text, px, tex, color, shadows) {
    const k = devicePixelRatio || 1, m = measure(text, px), pad = shadowPad(shadows);
    const cw = Math.ceil((m.w + pad * 2) * k), ch = Math.ceil((m.h + pad * 2) * k);
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; cv.style.width = cw / k + 'px'; cv.style.height = ch / k + 'px'; cv.style.margin = `${-pad}px`; }
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cw, ch);
    paintName(ctx, Math.round(pad * k), Math.round(pad * k), text, px, tex, color, shadows, k);
  }

  // =====================================================================================
  // Shared editors
  // =====================================================================================
  function nameField(obj) {
    const inp = h('input', { class: 'field', value: obj.name, maxlength: 64, 'aria-label': 'Paint name', oninput: () => { obj.name = inp.value; changed(false); }, onchange: () => commit() });
    return labeled('Paint name', inp);
  }

  function shadowsPanel(list) {
    const body = h('div', { class: 'stops' });
    const render = () => {
      body.textContent = '';
      if (!list.length) body.append(h('p', { class: 'hint' }, 'No shadows. 7TV draws each one as a CSS drop-shadow, in order.'));
      list.forEach((s, i) => {
        const { hex, alpha } = PL.decToHexAlpha(s.color);
        body.append(h('div', { class: 'shadow-row sortable-item' }, grip(`Move shadow ${i + 1}`),
          slider('X', s.x_offset, { min: -10, max: 10, step: 0.5, unit: 'px', onInput: (v) => { s.x_offset = v; changed(false); }, onCommit: () => commit() }),
          slider('Y', s.y_offset, { min: -10, max: 10, step: 0.5, unit: 'px', onInput: (v) => { s.y_offset = v; changed(false); }, onCommit: () => commit() }),
          slider('Blur', s.radius, { min: 0, max: 20, step: 0.5, unit: 'px', onInput: (v) => { s.radius = v; changed(false); }, onCommit: () => commit() }),
          iconBtn('trash', `Remove shadow ${i + 1}`, () => { list.splice(i, 1); render(); changed(true); }, { cls: 'sm danger' }),
          colorField(hex, alpha, (hx, a, c) => { s.color = PL.hexAlphaToDec(hx, a); changed(c); }, { label: `Shadow ${i + 1}` })));
      });
    };
    render();
    sortable(body, (from, to) => { const [x] = list.splice(from, 1); list.splice(to, 0, x); render(); changed(true); });
    const add = btn('Add shadow', () => { list.push({ x_offset: 0, y_offset: 0, radius: 2, color: PL.hexAlphaToDec('#000000', 0.8) }); render(); changed(true); }, 'secondary small', 'plus');
    return panel('Shadows', [body, h('div', { class: 'row' }, add)], [], { count: list.length || null });
  }

  // =====================================================================================
  // Static editor
  // =====================================================================================
  function renderStaticEditor(root) {
    const p = state.static;
    const isUrl = p.function === 'URL';
    const typeCtl = seg([['LINEAR_GRADIENT', 'Linear'], ['RADIAL_GRADIENT', 'Radial'], ['URL', 'Image URL']], p.function, (v) => { p.function = v; renderEditor(); changed(true); }, 'Function');
    const paintBody = [nameField(p), labeled('Function', typeCtl)];
    if (p.function === 'LINEAR_GRADIENT') paintBody.push(slider('Angle', p.angle, { min: 0, max: 360, step: 1, unit: '°', onInput: (v) => { p.angle = v; changed(false); }, onCommit: () => commit() }));
    if (p.function === 'RADIAL_GRADIENT') paintBody.push(labeled('Shape', seg([['circle', 'Circle'], ['ellipse', 'Ellipse']], p.shape, (v) => { p.shape = v; changed(true); }, 'Shape')));
    if (!isUrl) paintBody.push(checkbox('Repeating gradient', p.repeat, (v) => { p.repeat = v; changed(true); }));
    if (isUrl) {
      const url = h('input', { class: 'field mono', value: p.image_url, placeholder: 'https://…/paint.gif', spellcheck: false, 'aria-label': 'Image URL', oninput: () => { p.image_url = url.value.trim(); changed(false); }, onchange: () => commit() });
      paintBody.push(labeled('Image URL', url), h('p', { class: 'hint' }, '7TV stretches the image over the whole name (background-size 100% 100%). Build animated images in the Animated tab.'));
    }
    root.append(panel('Paint', paintBody));
    if (!isUrl) {
      const es = Paint.editorStops(p);
      const ed = stopsEditor(es, (stops, c) => {
        p.stops = stops.map((s) => ({ at: Math.round(s.at * 10000) / 10000, color: PL.hexAlphaToDec(s.color, s.a) }));
        changed(c);
      }, { palettes: true });
      root.append(panel('Colour stops', [ed], [], { count: p.stops.length }));
    }
    root.append(shadowsPanel(p.shadows));
  }

  // =====================================================================================
  // Preview panel (shared shell)
  // =====================================================================================
  const SIZES = [36, 24, 18];
  const CHAT = [['14:02', 'quietoak', '#1e90ff', 'that paint is clean'], ['14:02', null, null, 'thanks, made it myself'], ['14:03', 'nora_byte', '#9acd32', 'how long did the animation take']];
  function previewPanel(kind) {
    const pv = state.preview;
    const text = h('input', { class: 'field', value: pv.text, maxlength: 25, 'aria-label': 'Preview name', oninput: () => { pv.text = text.value || ' '; refreshPreview(); save(); } });
    const color = colorField(pv.color, null, (hx) => { pv.color = hx; refreshPreview(); save(); }, { label: 'Name colour' });
    const bg = seg([['dark', 'Dark chat'], ['light', 'Light chat'], ['checker', 'Transparent']], pv.bg, (v) => { pv.bg = v; box.className = 'stagebox ' + v; save(); }, 'Backdrop');
    const box = h('div', { class: 'stagebox ' + pv.bg, id: 'stagebox' });
    const ctl = h('div', { class: 'split' }, labeled('Preview name', text), labeled('Name colour', color));
    const body = [ctl, h('p', { class: 'hint' }, 'The name colour shows through any transparent part of the paint, as it does in 7TV.'), h('div', { class: 'row' }, bg)];
    const p = panel('Preview', [], [], { id: 'previewPanel' });
    p.querySelector('.body').append(...body);
    p.querySelector('.body').prepend(box);
    // names
    const names = SIZES.map((px) => (kind === 'static' ? h('span', { class: 'pname painted', 'aria-hidden': 'true', style: { fontSize: px + 'px' } }) : h('canvas', { class: 'pname', 'aria-hidden': 'true' })));
    const chat = h('div', { class: 'chat' });
    const chatNames = [];
    for (const [ts, who, col, msg] of CHAT) {
      let nameEl;
      if (who) nameEl = h('span', { class: 'who', style: { color: col } }, who);
      else { nameEl = kind === 'static' ? h('span', { class: 'who painted', 'aria-hidden': 'true' }) : h('canvas', { 'aria-hidden': 'true' }); chatNames.push(nameEl); }
      chat.append(h('div', { class: 'msg' }, h('span', { class: 'ts' }, ts), nameEl, ': ' + msg));
    }
    box.append(...names, chat);
    box.append(h('span', { class: 'sr-only' }, 'Painted name preview of ' + state.preview.text));
    return { el: p, names, chatNames, box };
  }

  let pv = null; // current preview handles
  function refreshPreview() { if (state.mode === 'static') updateStaticPreview(); else rt.redraw = true; }

  function updateStaticPreview() {
    if (!pv || state.mode !== 'static') return;
    const p = state.static, st = Paint.styleFor(p);
    for (const el of [...pv.names, ...pv.chatNames]) {
      el.textContent = state.preview.text;
      el.style.color = state.preview.color;
      el.style.backgroundImage = st.backgroundImage;
      el.style.backgroundSize = st.backgroundSize;
      el.style.filter = st.filter;
    }
  }

  // =====================================================================================
  // Output panel (code + exports)
  // =====================================================================================
  let codeTab = 'json';
  let codePre = null;
  function codeBox(getText, tabs) {
    codePre = h('pre', { class: 'code', tabindex: '0', 'aria-label': 'Paint code' });
    const tabSeg = seg(tabs, codeTab, (v) => { codeTab = v; updateOutput(); }, 'Code format');
    const copyB = iconBtn('copy', 'Copy code', async () => {
      const ok = await copyText(codePre.textContent);
      copyB.replaceChildren(icon(ok ? 'check' : 'copy')); copyB.style.color = ok ? 'var(--green)' : '';
      setTimeout(() => { copyB.replaceChildren(icon('copy')); copyB.style.color = ''; }, 1600);
      if (!ok) toast('Copy failed. Select the code and copy it by hand.', 'error');
    });
    const wrap = h('div', { class: 'code-wrap' }, h('div', { class: 'code-head' }, tabSeg, h('span', { class: 'grow' }), copyB), codePre);
    wrap.getText = getText;
    return wrap;
  }
  let outputGetter = null;
  function updateOutput() { if (codePre && outputGetter) codePre.textContent = outputGetter(); }

  function staticOutput() {
    const p = state.static;
    outputGetter = () => (codeTab === 'css' ? Paint.cssText(state.static) : Paint.toJson(state.static));
    const code = codeBox(outputGetter, [['json', '7TV JSON'], ['css', 'CSS']]);
    const importB = btn('Import JSON', openImport, 'secondary small', 'upload');
    const dl = btn('Download JSON', () => download(new Blob([Paint.toJson(state.static)], { type: 'application/json' }), slug(state.static.name) + '.json'), 'secondary small', 'download');
    const tw = h('input', { class: 'num', value: state.texSize[0], 'aria-label': 'PNG width (px)' }), th = h('input', { class: 'num', value: state.texSize[1], 'aria-label': 'PNG height (px)' });
    const readSize = () => { state.texSize = [Math.max(1, Math.min(4096, parseInt(tw.value) || 256)), Math.max(1, Math.min(2048, parseInt(th.value) || 64))]; tw.value = state.texSize[0]; th.value = state.texSize[1]; save(); return state.texSize; };
    tw.onchange = readSize; th.onchange = readSize;
    const nsz = slider('Name size', state.nameSize, { min: 12, max: 160, step: 1, unit: 'px', onInput: (v) => { state.nameSize = v; save(); } });
    const pngTex = btn('Paint PNG', async () => {
      const [w, hh] = readSize();
      try { const cv = await staticTexture(p, w, hh); cv.toBlob((b) => download(b, slug(p.name) + '-paint.png')); }
      catch (e) { toast(e.message, 'error'); }
    }, 'secondary', 'image');
    const pngName = btn('Name PNG', async () => {
      try { const cv = await staticNameCanvas(state.nameSize); cv.toBlob((b) => download(b, slug(p.name) + '-name.png')); }
      catch (e) { toast(e.message, 'error'); }
    }, 'secondary', 'image');
    const toAnim = btn('Animate this paint', () => { state.anim = staticToAnim(state.static); state.mode = 'anim'; state.sel = state.anim.layers[0] ? { kind: 'layer', id: state.anim.layers[0].id } : null; renderAll(); commit(); toast('Copied into the animated editor as a layer.', 'success'); }, 'primary', 'wand');
    return panel('Export', [
      code, h('div', { class: 'row' }, importB, dl),
      h('div', { class: 'sub' }, h('span', { class: 'label' }, 'Images'),
        h('div', { class: 'row' }, h('span', { class: 'hint' }, 'Paint size'), tw, h('span', { class: 'unit' }, '×'), th, h('span', { class: 'unit' }, 'px')),
        nsz, h('div', { class: 'row' }, pngTex, pngName)),
      h('div', { class: 'sub' }, h('span', { class: 'label' }, 'Animate'), h('p', { class: 'hint' }, 'Turns this gradient into a layer you can move, then add effects, sparkles or materials on top.'), h('div', null, toAnim)),
    ]);
  }

  function loadImage(src) {
    return new Promise((res, rej) => {
      const im = new Image(); im.crossOrigin = 'anonymous';
      im.onload = () => res(im); im.onerror = () => rej(new Error('Could not load that image. The host may block cross-origin use.'));
      im.src = src;
    });
  }
  async function staticTexture(p, w, hh) {
    const cv = h('canvas', { width: w, height: hh });
    const ctx = cv.getContext('2d');
    if (p.function === 'URL') {
      if (!p.image_url) throw new Error('Add an image URL first.');
      const safe = Paint.safeUrl(p.image_url);
      if (!safe) throw new Error('Add an http or https image link first.');
      const im = await loadImage(safe);
      ctx.drawImage(im, 0, 0, w, hh);
      try { ctx.getImageData(0, 0, 1, 1); } catch (e) { throw new Error('That host blocks reading the image, so it can only be previewed, not exported.'); }
    } else ctx.putImageData(Paint.rasterize(p, w, hh), 0, 0);
    return cv;
  }
  async function staticNameCanvas(px) {
    const p = state.static, m = measure(state.preview.text, px), pad = shadowPad(p.shadows);
    const tex = await staticTexture(p, m.w, m.h); // CSS gradients are laid out on the name box itself
    const cv = h('canvas', { width: m.w + pad * 2, height: m.h + pad * 2 });
    paintName(cv.getContext('2d'), pad, pad, state.preview.text, px, tex, state.preview.color, p.shadows, 1);
    return cv;
  }

  function openImport() {
    const ta = h('textarea', { class: 'code', spellcheck: false, placeholder: '{ "name": "Unnamed Paint", "function": "LINEAR_GRADIENT", … }', 'aria-label': 'Paint JSON' });
    const file = h('input', { type: 'file', accept: '.json,application/json', class: 'sr-only', onchange: async () => { if (file.files[0]) ta.value = await file.files[0].text(); } });
    const d = dialog('Import a paint', [
      h('p', { class: 'hint' }, 'Paste 7TV paint JSON. Colours can be 7TV integers or hex strings. Animated project files open in the Animated tab.'),
      ta, h('label', { class: 'btn secondary small', style: { alignSelf: 'flex-start' } }, icon('folder'), 'Open file', file),
    ], {
      footer: [btn('Cancel', () => d.close(), 'secondary'), btn('Import', () => {
        try {
          const obj = JSON.parse(ta.value);
          const msg = loadJson(obj);
          d.close(); renderAll(); commit(); toast(msg, "success");
        } catch (e) { toast("Couldn’t read that JSON. Check it’s a 7TV paint or a cyex paints project.", "error"); console.warn(e); }
      }, 'primary')],
    });
  }

  function staticToAnim(p) {
    const doc = E.blankDoc();
    doc.name = p.name; doc.shadows = clone(p.shadows);
    if (p.function === 'URL') return doc;
    let stops = Paint.editorStops(p), count = 1;
    if (p.repeat && stops.length > 1) {
      const f = stops[0].at, l = stops[stops.length - 1].at;
      if (l - f > 0) { count = Math.round((1 / (l - f)) * 4) / 4 || 1; stops = stops.map((s) => Object.assign({}, s, { at: (s.at - f) / (l - f) })); }
    }
    doc.layers.push(p.function === 'RADIAL_GRADIENT'
      ? E.newLayer('radial', { params: { stops, count, speed: 0, circle: p.shape === 'circle' } })
      : E.newLayer('linear', { params: { stops, angle: p.angle, count, speed: 0 } }));
    return doc;
  }

  // =====================================================================================
  // Animated editor
  // =====================================================================================
  const rt = { cp: null, cache: [], dirty: true, playing: !matchMedia('(prefers-reduced-motion: reduce)').matches, frame: 0, start: performance.now(), shown: -1, redraw: true, texCv: null, ui: null };
  const FPS = [[10, '10'], [20, '20'], [25, '25'], [33, '33'], [50, '50']];

  const findSel = () => {
    const s = state.sel; if (!s) return null;
    const list = s.kind === 'layer' ? state.anim.layers : state.anim.effects;
    const item = list.find((x) => x.id === s.id);
    return item ? { kind: s.kind, item, list } : null;
  };

  function renderAnimEditor(root) {
    const d = state.anim;
    if (!findSel()) state.sel = d.layers.length ? { kind: 'layer', id: d.layers[d.layers.length - 1].id } : d.effects.length ? { kind: 'effect', id: d.effects[0].id } : null;
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
      renderEditor(); changed(true);
      if (kb) $(`#editor [data-id="${it.id}"] .grip`)?.focus();
    });
    colA.append(panel('Layers', [layerList, h('div', { class: 'row' },
      btn('Add layer', () => openLibrary('layer'), 'secondary small', 'plus'),
      btn('Add element', () => openLibrary('layer', 'Scene elements'), 'ghost small', 'sparkles'))], [], { count: d.layers.length }));

    const fxList = h('div', { class: 'list', role: 'list', 'aria-label': 'Effects, applied top to bottom' });
    if (!d.effects.length) fxList.append(h('div', { class: 'empty' }, icon('fx'), h('span', null, 'Effects run on the finished image, top to bottom: lighting, 3D, distortion, colour.')));
    for (const e of d.effects) fxList.append(listItem(e, 'effect', d.effects));
    sortable(fxList, (from, to, kb) => {
      const [it] = d.effects.splice(from, 1); d.effects.splice(to, 0, it);
      renderEditor(); changed(true);
      if (kb) $(`#editor [data-id="${it.id}"] .grip`)?.focus();
    });
    colA.append(panel('Effects', [fxList, h('div', { class: 'row' }, btn('Add effect', () => openLibrary('effect'), 'secondary small', 'plus'))], [], { count: d.effects.length }));
    colA.append(paintPanel(d));
    colA.append(shadowsPanel(d.shadows));

    const s = findSel();
    colB.append(s ? settingsPanel(s) : panel('Settings', [h('div', { class: 'empty' }, icon('layers'), h('span', null, 'Select a layer or effect to change it.'))]));
    scheduleThumbs(true);
  }

  function paintPanel(d) {
    const info = h('span', { class: 'stat' });
    const setInfo = () => { info.textContent = `${E.frameCount(d)} frames · ${PL.fmtNum(d.duration, 1)} s · ${Math.round(100 / d.fps)} cs per frame`; };
    setInfo();
    const wIn = h('input', { class: 'num', value: d.width, 'aria-label': 'Width (px)' }), hIn = h('input', { class: 'num', value: d.height, 'aria-label': 'Height (px)' });
    const size = () => { d.width = Math.max(8, Math.min(1024, parseInt(wIn.value) || 256)); d.height = Math.max(8, Math.min(512, parseInt(hIn.value) || 64)); wIn.value = d.width; hIn.value = d.height; changed(true); scheduleThumbs(true); };
    wIn.onchange = size; hIn.onchange = size;
    const sizePresets = seg([['256x64', '256×64'], ['320x64', '320×64'], ['384x96', '384×96'], ['512x128', '512×128']], `${d.width}x${d.height}`, (v) => { const [a, b] = v.split('x').map(Number); d.width = a; d.height = b; wIn.value = a; hIn.value = b; changed(true); scheduleThumbs(true); }, 'Size presets');
    d.tweak = Object.assign({}, E.DEFAULT_TWEAK, d.tweak || {});
    return panel('Paint', [
      nameField(d),
      group('Size and timing', [
        h('div', { class: 'ctl' }, h('div', { class: 'top' }, h('span', { class: 'label' }, 'Size'), wIn, h('span', { class: 'unit' }, '×'), hIn, h('span', { class: 'unit' }, 'px')), sizePresets,
          h('p', { class: 'hint' }, '7TV stretches the image across the name, so a wide strip works best.')),
        labeled('Frames per second', seg(FPS, d.fps, (v) => { d.fps = v; setInfo(); changed(true); }, 'Frames per second')),
        slider('Loop length', d.duration, { min: 0.4, max: 8, step: 0.1, unit: 's', onInput: (v) => { d.duration = v; setInfo(); changed(false); }, onCommit: () => commit() }),
        info,
      ], { open: true }),
      group('Recolour everything', tweakControls(d.tweak, 'Shifts the colours of the whole paint, after all layers and effects.')),
    ]);
  }

  function tweakControls(tw, hint) {
    const on = (v) => changed(false), done = () => changed(true);
    return [
      h('p', { class: 'hint' }, hint),
      slider('Hue shift', tw.hue, { min: -180, max: 180, step: 1, unit: '°', onInput: (v) => { tw.hue = v; on(); }, onCommit: done }),
      h('div', { class: 'split' },
        slider('Saturation', tw.sat, { min: 0, max: 2, step: 0.01, scale: 100, unit: '%', decimals: 0, onInput: (v) => { tw.sat = v; on(); }, onCommit: done }),
        slider('Brightness', tw.bright, { min: -0.5, max: 0.5, step: 0.01, scale: 100, decimals: 0, onInput: (v) => { tw.bright = v; on(); }, onCommit: done }),
        slider('Contrast', tw.contrast, { min: 0.2, max: 2, step: 0.01, scale: 100, unit: '%', decimals: 0, onInput: (v) => { tw.contrast = v; on(); }, onCommit: done }),
        slider('Tint amount', tw.tintAmt, { min: 0, max: 1, step: 0.01, scale: 100, unit: '%', decimals: 0, onInput: (v) => { tw.tintAmt = v; on(); }, onCommit: done })),
      labeled('Tint colour', colorField(tw.tint, null, (hx, a, c) => { tw.tint = hx; c ? done() : on(); }, { label: 'Tint colour' })),
      h('div', null, btn('Reset colours', () => { Object.assign(tw, E.DEFAULT_TWEAK); renderEditor(); done(); }, 'ghost small', 'reset')),
    ];
  }

  function listItem(item, kind, list) {
    const isSel = state.sel && state.sel.id === item.id;
    const def = kind === 'layer' ? PL.LAYERS[item.type] : PL.EFFECTS[item.type];
    const thumb = h('canvas', { class: 'thumb', width: 88, height: 22, 'data-thumb': item.id, 'aria-hidden': 'true' });
    const idx = list.indexOf(item);
    const select_ = () => { if (!(state.sel && state.sel.id === item.id)) { state.sel = { kind, id: item.id }; renderEditor(); } };
    // the name is the row's real control: a named button that selects (Enter or Space), F2 or double-click renames, Delete removes
    const nameEl = h('button', { type: 'button', class: 'name', title: 'Double-click or F2 to rename', 'aria-current': isSel ? 'true' : null, 'aria-describedby': null, onclick: () => select_() }, item.name || def.name);
    nameEl.addEventListener('dblclick', () => {
      const inp = h('input', { class: 'field rename', value: item.name || def.name, maxlength: 64, 'aria-label': 'Rename' });
      let finished = false;
      const done = (ok) => { if (finished) return; finished = true; if (ok && inp.value.trim()) { item.name = inp.value.trim(); changed(true); } renderEditor(); focusItem(item.id); };
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
      iconBtn(item.visible ? 'eye' : 'eyeOff', 'Visible', () => { item.visible = !item.visible; renderEditor(); changed(true); }, { cls: 'sm', attrs: { 'aria-pressed': String(item.visible), 'data-tip': item.visible ? 'Hide' : 'Show' } }),
      iconBtn('dup', 'Duplicate', () => { const c = clone(item); c.id = PL.uid(kind[0]); list.splice(idx + 1, 0, c); state.sel = { kind, id: c.id }; renderEditor(); changed(true); }, { cls: 'sm' }),
      iconBtn('trash', 'Delete', () => remove(), { cls: 'sm danger', attrs: { 'data-hint': 'Delete key' } })));
    function remove() { list.splice(list.indexOf(item), 1); if (isSel) state.sel = null; renderEditor(); changed(true); toast(`Removed ${item.name || def.name}. Ctrl+Z brings it back.`); }
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
          try { params[pd.k] = await fileToDataUrl(f, 512); await cacheImage(params[pd.k]); onCommit(); renderEditor(); }
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
    const refreshIfNeeded = () => { const nv = visibleKeys(def, item.params); if (nv !== vis) { vis = nv; const old = $('#settingsPanel'); if (old) { const fd = focusDescriptor(); old.replaceWith(settingsPanel(s)); restoreFocus(fd); } } };
    const onInput = () => changed(false), onCommit = () => { changed(true); refreshIfNeeded(); };
    const nameIn = h('input', { class: 'field', value: item.name || def.name, 'aria-label': 'Name', 'data-sel-first': '', oninput: () => { item.name = nameIn.value; const n = $(`[data-id="${item.id}"] .name`); if (n) n.textContent = item.name; changed(false); }, onchange: () => commit() });
    const top = [h('p', { class: 'hint' }, def.desc), labeled('Name', nameIn)];
    if (kind === 'layer') {
      top.push(h('div', { class: 'split' },
        labeled('Blend', select(PL.BLENDS, item.blend, (v) => { item.blend = v; renderEditor(); changed(true); }, 'Blend')),
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
      body.push(group('Colour tweaks', tweakControls(item.tweak, 'Shift the colours of just this layer.')));
    }
    const hasXY = def.params.some((pd) => pd.k === 'x') || def.params.some((pd) => pd.k === 'cx' && /^Centre/.test(pd.l));
    if (hasXY) body.splice(2, 0, h('p', { class: 'hint drag-hint' }, icon('move'), 'Drag on the paint image to move it.'));
    const reset = iconBtn('reset', 'Reset to defaults', () => { item.params = E.defaults(def); if (item.xf) item.xf = Object.assign({}, E.DEFAULT_XF); if (item.tweak) item.tweak = Object.assign({}, E.DEFAULT_TWEAK); renderEditor(); changed(true); }, { cls: 'sm' });
    const dup = iconBtn('dup', 'Duplicate', () => { const list = s.list, c = clone(item); c.id = PL.uid(kind[0]); list.splice(list.indexOf(item) + 1, 0, c); state.sel = { kind, id: c.id }; renderEditor(); changed(true); }, { cls: 'sm' });
    const setAll = (open) => { for (const hd of document.querySelectorAll('#settingsPanel .ghead')) if ((hd.getAttribute('aria-expanded') === 'true') !== open) hd.click(); };
    const collapseAll = iconBtn('collapse', 'Collapse all groups', () => setAll(false), { cls: 'sm' });
    const expandAll = iconBtn('expand', 'Expand all groups', () => setAll(true), { cls: 'sm' });
    return panel((kind === 'layer' ? (def.draw ? 'Element: ' : 'Layer: ') : 'Effect: ') + (item.name || def.name), body, [collapseAll, expandAll, dup, reset], { id: 'settingsPanel', key: 'settings' });
  }

  function fileToDataUrl(file, max) {
    return new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = async () => {
        try {
          const im = await loadImage(r.result);
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
    const im = await loadImage(src);
    const cv = h('canvas', { width: im.width, height: im.height }), ctx = cv.getContext('2d');
    ctx.drawImage(im, 0, 0);
    PL.imageCache[src] = { w: im.width, h: im.height, data: ctx.getImageData(0, 0, im.width, im.height).data };
  }
  async function cacheDocImages(doc) {
    const srcs = doc.layers.filter((l) => l.type === 'image' && l.params.src).map((l) => l.params.src);
    await Promise.all(srcs.map((s) => cacheImage(s).catch(() => {})));
    if (srcs.length) { rt.dirty = true; scheduleThumbs(true); }
  }

  // ---- thumbnails ----
  let thumbTimer = 0;
  function scheduleThumbs(now) { clearTimeout(thumbTimer); thumbTimer = setTimeout(drawThumbs, now ? 0 : 250); }
  function drawThumbs() {
    if (state.mode !== 'anim') return;
    const d = state.anim, t = 0.15;
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

  // ---- animated preview + playback ----
  function animStage(root) {
    const p = previewPanel('anim');
    pv = p;
    const d = state.anim;
    rt.texCv = h('canvas', { class: 'tex', width: d.width, height: d.height, 'aria-label': 'Paint image, current frame', role: 'img' });
    const playB = iconBtn(rt.playing ? 'pause' : 'play', rt.playing ? 'Pause' : 'Play', togglePlay, { attrs: { 'data-hint': 'Space' } });
    const scrub = h('input', { type: 'range', min: 0, max: E.frameCount(d) - 1, step: 1, value: 0, 'aria-label': 'Frame' });
    scrub.addEventListener('input', () => { rt.playing = false; setPlayIcon(); rt.frame = +scrub.value; rt.redraw = true; });
    const fno = h('span', { class: 'frameno' });
    p.el.querySelector('.body').append(h('div', { class: 'sub' }, h('span', { class: 'label' }, 'Paint image'), rt.texCv, h('div', { class: 'transport' }, playB, scrub, fno)));
    rt.ui = { playB, scrub, fno };
    root.append(p.el, animOutput());
    rt.redraw = true; rt.dirty = true;
    enableCanvasDrag(rt.texCv, (cv, e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; });
    pv.names.forEach((cv) => enableCanvasDrag(cv, (c, e) => {
      // the name canvas has shadow padding around the text box the paint is stretched over
      const r = c.getBoundingClientRect(), pad = shadowPad(state.anim.shadows);
      return [(e.clientX - r.left - pad) / (r.width - 2 * pad), (e.clientY - r.top - pad) / (r.height - 2 * pad)];
    }));
  }

  // Drag on the paint image (or a big preview name) to place the selected element or centre point.
  function dragTarget() {
    const s = findSel(); if (!s) return null;
    const def = s.kind === 'layer' ? PL.LAYERS[s.item.type] : PL.EFFECTS[s.item.type];
    // only real positions: x/y on elements, and cx/cy where they mean a centre (Checker and Cells use cx/cy for columns and rows)
    const byKey = Object.fromEntries(def.params.map((p) => [p.k, p]));
    if (byKey.x && byKey.y) return { p: s.item.params, kx: 'x', ky: 'y', bx: 'toX', by: 'toY' };
    if (byKey.cx && byKey.cy && /^Centre/.test(byKey.cx.l)) return { p: s.item.params, kx: 'cx', ky: 'cy' };
    return null;
  }
  function enableCanvasDrag(cv, toUV) {
    cv.addEventListener('pointerenter', () => { cv.style.cursor = dragTarget() ? 'move' : ''; });
    cv.addEventListener('pointerdown', (e) => {
      const tg = dragTarget();
      if (!tg || e.button !== 0) return;
      e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (_) {}
      const useB = e.shiftKey && tg.bx && tg.p.motion === 'path';
      const kx = useB ? tg.bx : tg.kx, ky = useB ? tg.by : tg.ky;
      const set = (ev) => {
        const [u, v] = toUV(cv, ev);
        tg.p[kx] = Math.round(PL.clamp(u, -0.25, 1.25) * 100) / 100; tg.p[ky] = Math.round(PL.clamp(v, -0.25, 1.25) * 100) / 100;
        changed(false);
      };
      set(e);
      const up = () => { cv.removeEventListener('pointermove', set); cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up); const old = $('#settingsPanel'), s = findSel(); if (old && s) old.replaceWith(settingsPanel(s)); changed(true); };
      cv.addEventListener('pointermove', set); cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    });
  }

  // Drop image files anywhere: they become Picture elements (animated mode) or open as a layer.
  document.addEventListener('dragover', (e) => { if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file')) { e.preventDefault(); document.body.classList.add('dropping'); } });
  document.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('dropping'); });
  document.addEventListener('drop', async (e) => {
    document.body.classList.remove('dropping');
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    const json = files.find((f) => /json$/i.test(f.name) || f.type === 'application/json');
    if (json) {
      try {
        const obj = JSON.parse(await json.text());
        const msg = loadJson(obj);
        renderAll(); commit(); toast(msg, "success");
      } catch (err) { toast("Couldn’t open " + json.name + ". Check it’s a paint or project file.", "error"); console.warn(err); }
      return;
    }
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return;
    if (state.mode !== 'anim') { state.mode = 'anim'; }
    for (const f of imgs) {
      try {
        const src = await fileToDataUrl(f, 512); await cacheImage(src);
        const l = E.newLayer('sprite', { name: f.name.replace(/\.[^.]+$/, '').slice(0, 30), params: { src } });
        state.anim.layers.push(l); state.sel = { kind: 'layer', id: l.id };
      } catch (err) { toast('Could not read ' + f.name + '.', 'error'); }
    }
    renderAll(); commit(); toast(imgs.length > 1 ? `Added ${imgs.length} pictures.` : 'Added the picture as an element. Drag it on the paint image to place it.', 'success');
  });
  function setPlayIcon() { if (!rt.ui) return; const b = rt.ui.playB; b.replaceChildren(icon(rt.playing ? 'pause' : 'play')); b.setAttribute('aria-label', rt.playing ? 'Pause' : 'Play'); b.dataset.tip = rt.playing ? 'Pause' : 'Play'; }
  function togglePlay() { rt.playing = !rt.playing; if (rt.playing) rt.start = performance.now() - (rt.frame / state.anim.fps) * 1000; setPlayIcon(); }

  function getFrame(i) {
    // cache frames only while the whole loop fits in ~160 MB; above that, render each frame on demand
    if (rt.cache[i]) return rt.cache[i];
    const img = E.renderFrame(rt.cp, i);
    if (rt.cp.W * rt.cp.H * 4 * rt.cp.frames <= 160e6) rt.cache[i] = img;
    return img;
  }
  // The preview loop never throws: a failing layer shows one error and waits for the next edit.
  function tick(now) {
    requestAnimationFrame(tick);
    if (state.mode !== 'anim' || !rt.texCv || (rt.broken && !rt.dirty)) return;
    if (document.querySelector('.backdrop')) return; // a dialog covers the preview
    try { step(now); rt.broken = false; }
    catch (e) { console.error(e); rt.broken = true; rt.dirty = false; toast('Couldn’t draw this paint. Undo the last change or remove the layer that broke it.', 'error'); }
  }
  function step(now) {
    const d = state.anim;
    if (rt.dirty) {
      rt.cp = E.compile(d); rt.cache = []; rt.dirty = false; rt.redraw = true;
      if (rt.texCv.width !== d.width || rt.texCv.height !== d.height) { rt.texCv.width = d.width; rt.texCv.height = d.height; }
      rt.ui.scrub.max = rt.cp.frames - 1;
    }
    const n = rt.cp.frames;
    if (rt.playing) {
      const f = Math.floor(((now - rt.start) / 1000) * d.fps) % n;
      if (f !== rt.frame) { rt.frame = f; rt.redraw = true; }
    }
    if (rt.frame >= n) rt.frame = 0;
    if (!rt.redraw && rt.shown === rt.frame) return;
    const img = getFrame(rt.frame);
    rt.texCv.getContext('2d').putImageData(img, 0, 0);
    const text = state.preview.text, color = state.preview.color;
    pv.names.forEach((cv, i) => drawNameCanvas(cv, text, SIZES[i], rt.texCv, color, d.shadows));
    pv.chatNames.forEach((cv) => drawNameCanvas(cv, text, 13, rt.texCv, color, d.shadows));
    rt.ui.scrub.value = rt.frame;
    rt.ui.fno.textContent = `${String(rt.frame + 1).padStart(String(n).length, '0')} / ${n}`;
    rt.shown = rt.frame; rt.redraw = false;
  }
  requestAnimationFrame(tick);

  // ---- animated export ----
  let lastExport = null, exporting = null;
  const setExport = (rec) => { if (lastExport && lastExport.url) URL.revokeObjectURL(lastExport.url); lastExport = rec; };
  function animOutput() {
    const d = state.anim, g = state.gif;
    const result = h('div', { class: 'stack', id: 'exportResult' });
    if (lastExport) showResult(result, lastExport);
    const exportBtns = [];
    const cancelB = btn('Cancel', () => { if (exporting) exporting.cancel = true; }, 'ghost small', 'x');
    cancelB.hidden = true;

    // Every export works on a snapshot of the paint taken when it starts, so editing meanwhile
    // can't mix frames. Only one export runs at a time, and it can be cancelled.
    async function runExport(b, work) {
      if (exporting) return;
      const doc = clone(state.anim);
      if (!doc.layers.some((l) => l.visible)) { toast('There is nothing to export yet. Add or show a layer first.'); return; }
      const cp = E.compile(doc);
      const px = cp.W * cp.H * cp.frames;
      if (px > 12e6 && !(await confirmHeavy(cp))) return;
      exporting = { cancel: false };
      const job = exporting;
      const old = [...b.childNodes];
      exportBtns.forEach((x) => (x.disabled = true));
      b.replaceChildren(h('span', { class: 'spinner' }), h('span', null, 'Rendering…'));
      cancelB.hidden = false;
      const update = (txt) => { b.lastChild.textContent = txt; };
      const frames = async () => {
        const out = [];
        for (let i = 0; i < cp.frames; i++) {
          if (job.cancel) throw new Error('cancelled');
          out.push(E.renderFrame(cp, i));
          update(`Rendering ${i + 1} / ${cp.frames}`);
          await new Promise((r) => setTimeout(r));
        }
        if (job.cancel) throw new Error('cancelled');
        update('Encoding…'); await new Promise((r) => setTimeout(r, 20));
        return out;
      };
      try { await work({ doc, cp, frames }); }
      catch (e) { if (e.message === 'cancelled') toast('Export cancelled.'); else { console.error(e); toast('Couldn’t finish the export. Try a smaller size or a shorter loop.', 'error'); } }
      finally {
        exporting = null;
        exportBtns.forEach((x) => (x.disabled = false));
        b.replaceChildren(...old);
        cancelB.hidden = true;
      }
    }
    function confirmHeavy(cp) {
      return new Promise((resolve) => {
        let answered = false;
        const finish = (v) => { if (answered) return; answered = true; resolve(v); dlg.close(); };
        const dlg = dialog('This is a big export', [h('p', null, `It renders ${PL.fmtInt(cp.frames)} frames at ${cp.W}×${cp.H}, which can take a minute and use a lot of memory. A smaller size, fewer frames per second or a shorter loop make it faster.`)], {
          footer: [btn('Cancel', () => finish(false), 'secondary'), btn('Export anyway', () => finish(true), 'primary')],
          onClose: () => { if (!answered) { answered = true; resolve(false); } },
        });
      });
    }
    const finishExport = (rec) => { setExport(rec); showResult(result, rec); download(rec.blob, rec.name); };

    const gifB = btn('Export GIF', () => runExport(gifB, async ({ doc, cp, frames }) => {
      const fr = await frames();
      const blob = PL.Encode.encodeGif(fr, { delayCs: Math.round(100 / doc.fps), colors: g.colors, dither: g.dither, alphaCut: g.alpha ? 128 : 0, matte: g.alpha ? null : PL.hexToRgb(state.preview.color) });
      finishExport({ blob, name: slug(doc.name) + '.gif', kind: 'GIF', w: cp.W, h: cp.H, frames: fr.length, shadows: doc.shadows });
    }), 'primary', 'film');
    const apngB = btn('Export APNG', () => runExport(apngB, async ({ doc, cp, frames }) => {
      if (!window.CompressionStream) { toast('This browser can’t make APNG files. Use a current Chrome, Edge or Firefox.', 'error'); return; }
      const fr = await frames();
      const blob = await PL.Encode.encodeApng(fr, { delayMs: 1000 / doc.fps });
      finishExport({ blob, name: slug(doc.name) + '.png', kind: 'APNG', w: cp.W, h: cp.H, frames: fr.length, shadows: doc.shadows });
    }), 'secondary', 'film');
    const pngB = btn('Frame PNG', () => { if (!rt.texCv) return; rt.texCv.toBlob((b) => download(b, `${slug(d.name)}-frame-${rt.frame + 1}.png`)); }, 'secondary', 'image');
    const sheetB = btn('Sprite sheet', () => runExport(sheetB, async ({ doc, cp, frames }) => {
      const fr = await frames();
      // a grid, so tall loops stay under the browser's canvas size limit
      const cols = Math.max(1, Math.min(fr.length, Math.floor(16384 / cp.W))), rows = Math.ceil(fr.length / cols);
      const cv = h('canvas', { width: cp.W * cols, height: cp.H * rows }), ctx = cv.getContext('2d');
      fr.forEach((f, i) => ctx.putImageData(f, (i % cols) * cp.W, Math.floor(i / cols) * cp.H));
      await new Promise((res) => cv.toBlob((b) => { download(b, slug(doc.name) + '-sheet.png'); res(); }));
    }), 'secondary', 'image');

    // animated painted name (for sharing / showing off)
    const nameB = btn('Name GIF', () => runExport(nameB, async ({ doc, cp, frames }) => {
      const fr = await frames();
      const px = state.nameSize, m = measure(state.preview.text, px), pad = shadowPad(doc.shadows);
      const W = m.w + pad * 2, H = m.h + pad * 2;
      const cv = h('canvas', { width: W, height: H }), ctx = cv.getContext('2d', { willReadFrequently: true });
      const tex = h('canvas', { width: cp.W, height: cp.H }), tctx = tex.getContext('2d');
      const bg = state.preview.bg;
      const bgCol = bg === 'light' ? '#ffffff' : bg === 'dark' ? '#18181b' : null;
      const out = fr.map((f) => {
        tctx.putImageData(f, 0, 0);
        ctx.clearRect(0, 0, W, H);
        if (bgCol) { ctx.fillStyle = bgCol; ctx.fillRect(0, 0, W, H); }
        paintName(ctx, pad, pad, state.preview.text, px, tex, state.preview.color, doc.shadows, 1);
        return ctx.getImageData(0, 0, W, H);
      });
      const blob = PL.Encode.encodeGif(out, { delayCs: Math.round(100 / doc.fps), colors: g.colors, dither: g.dither, alphaCut: 110 });
      finishExport({ blob, name: slug(doc.name) + '-name.gif', kind: 'Name GIF', w: W, h: H, frames: out.length, isName: true });
    }), 'secondary', 'film');
    exportBtns.push(gifB, apngB, sheetB, nameB);

    const gifOpts = h('div', { class: 'sub' }, h('span', { class: 'label' }, 'GIF options'),
      h('div', { class: 'row' }, h('span', { class: 'hint' }, 'Colours'), seg([[64, '64'], [128, '128'], [256, '256']], g.colors, (v) => { g.colors = v; save(); }, 'GIF colours')),
      checkbox('Dither (smoother gradients, larger file)', g.dither, (v) => { g.dither = v; save(); }),
      checkbox('Keep transparent areas (the name colour shows through)', g.alpha, (v) => { g.alpha = v; save(); }),
      h('p', { class: 'hint' }, 'GIF has 256 colours and on/off transparency. APNG keeps full colour and soft edges, and 7TV can show it too.'));

    const nsz = slider('Name size', state.nameSize, { min: 12, max: 160, step: 1, unit: 'px', onInput: (v) => { state.nameSize = v; save(); } });

    // 7TV JSON for an image paint
    // the project preview leaves out embedded pictures (they can be megabytes); Save project keeps them
    const projectPreview = () => JSON.stringify({ cyexPaintProject: 1, doc: state.anim }, (k, v) => (k === 'src' && typeof v === 'string' && v.length > 80 ? '<picture data, kept in Save project>' : v), 2);
    outputGetter = () => (codeTab === 'project' ? projectPreview() : JSON.stringify({ name: state.anim.name, function: 'URL', repeat: false, angle: 0, shape: 'circle', image_url: state.url, stops: [], shadows: state.anim.shadows }, null, 2));
    if (codeTab === 'css') codeTab = 'json';
    const code = codeBox(outputGetter, [['json', '7TV JSON'], ['project', 'Project']]);
    const url = h('input', { class: 'field mono', value: state.url, placeholder: 'https://…/my-paint.gif', spellcheck: false, 'aria-label': 'Hosted image URL', oninput: () => { state.url = url.value.trim(); updateOutput(); save(); } });
    const saveP = btn('Save project', () => download(new Blob([JSON.stringify({ cyexPaintProject: 1, doc: state.anim })], { type: 'application/json' }), slug(d.name) + '.cyexpaint.json'), 'secondary small', 'save');
    const file = h('input', { type: 'file', accept: '.json,application/json', class: 'sr-only', onchange: async () => {
      const f = file.files[0]; if (!f) return;
      try {
        const obj = JSON.parse(await f.text());
        const msg = loadJson(obj); renderAll(); commit(); toast(msg, "success");
      } catch (e) { toast("Couldn’t open that file. Check it’s a paint or project file.", "error"); console.warn(e); }
    } });
    const openP = h('label', { class: 'btn secondary small' }, icon('folder'), 'Open project', file);

    return panel('Export', [
      h('div', { class: 'export-grid' }, gifB, apngB, pngB, sheetB, nameB), h('div', null, cancelB),
      result, gifOpts, nsz,
      h('div', { class: 'sub' }, h('span', { class: 'label' }, '7TV paint'),
        labeled('Where the image will be hosted', url),
        h('p', { class: 'hint' }, 'Animated paints are URL paints: upload the GIF or APNG somewhere public, paste the link, and the JSON below is ready.'),
        code, h('div', { class: 'row' }, saveP, openP)),
    ]);
  }
  function showResult(host, r) {
    host.textContent = '';
    if (!r.url) r.url = URL.createObjectURL(r.blob); // one URL per export, revoked when replaced
    const url = r.url;
    const sevenTv = r.isName ? null : h('span', { class: 'pname painted', style: { fontSize: '28px', color: state.preview.color, backgroundImage: `url("${url}")`, backgroundSize: '100% 100%', filter: Paint.filterCss({ shadows: r.shadows || state.anim.shadows }) } }, state.preview.text);
    host.append(h('div', { class: 'result' },
      h('img', { src: url, alt: r.kind + ' export' }),
      h('div', { class: 'ctl grow' },
        h('span', { class: 'stat' }, `${r.kind} · ${r.w}×${r.h} · ${r.frames} frames · ${PL.fmtBytes(r.blob.size)}`),
        sevenTv ? h('div', { class: 'stagebox ' + state.preview.bg, style: { padding: '10px 12px', border: '1px solid var(--border)' } }, sevenTv) : null,
        sevenTv ? h('span', { class: 'hint' }, 'Shown exactly the way 7TV applies an image paint.') : null,
        h('div', { class: 'row' }, btn('Download again', () => download(r.blob, r.name), 'ghost small', 'download')))));
  }

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
      const d = state.anim;
      if (kind === 'layer') {
        const l = E.newLayer(def.id);
        if (d.layers.length && ['sparkles', 'stars', 'shine', 'glints', 'particles', 'rays'].includes(def.id)) l.blend = 'screen';
        d.layers.push(l); state.sel = { kind, id: l.id };
      } else { const e = E.newEffect(def.id); d.effects.push(e); state.sel = { kind, id: e.id }; }
      dlg.close(); renderEditor(); changed(true); focusItem(state.sel.id);
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
    let tab = state.mode;
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
          host.append(h('button', { type: 'button', class: 'card', onclick: () => { state.static = clone(p); state.mode = 'static'; d.close(); renderAll(); commit(); } }, sw, h('b', null, p.name), h('span', null, `${p.function === 'RADIAL_GRADIENT' ? 'Radial' : 'Linear'} · ${p.stops.length} stops${p.shadows.length ? ' · shadow' : ''}`)));
        }
      } else {
        const work = [];
        for (const make of (tab === 'scenes' ? PL.ANIM_PRESETS.slice(0, PL.SCENE_COUNT) : PL.ANIM_PRESETS.slice(PL.SCENE_COUNT))) {
          const doc = make();
          const cv = h('canvas', { width: 192, height: 48, 'aria-hidden': 'true' });
          work.push([cv, doc]);
          host.append(h('button', { type: 'button', class: 'card', onclick: () => { state.anim = make(); state.mode = 'anim'; state.sel = null; d.close(); renderAll(); commit(); } }, cv, h('b', null, doc.name), h('span', null, doc.layers.map((l) => PL.LAYERS[l.type].name).concat(doc.effects.map((e) => PL.EFFECTS[e.type].name)).join(', '))));
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

  // =====================================================================================
  // Render
  // =====================================================================================
  // Re-rendering replaces the editor DOM, so remember what had focus and put focus back on the
  // matching control (same row and label), or the row, or its neighbour when the row is gone.
  const labelKey = (el) => (el.getAttribute('aria-label') || el.textContent || '').split(':')[0].trim();
  function focusDescriptor() {
    const a = document.activeElement, root = $('#editor');
    if (!a || !root.contains(a)) return null;
    const row = a.closest('[data-id]');
    const rows = row ? [...row.parentElement.querySelectorAll(':scope > [data-id]')] : [];
    return { id: row?.dataset.id, index: rows.indexOf(row), listLabel: row?.parentElement.getAttribute('aria-label'), isRow: a === row, inSettings: !!a.closest('#settingsPanel'), tag: a.tagName, label: labelKey(a) };
  }
  function restoreFocus(fd) {
    if (!fd) return;
    const root = $('#editor');
    const match = (scope) => [...scope.querySelectorAll('button, input, [tabindex="0"]')].find((el) => el.tagName === fd.tag && labelKey(el) === fd.label);
    let el = null;
    if (fd.id) {
      const row = root.querySelector(`[data-id="${fd.id}"]`);
      if (row) el = fd.isRow ? row : match(row) || row;
      else {
        const list = [...root.querySelectorAll('[aria-label]')].find((x) => x.getAttribute('aria-label') === fd.listLabel);
        const rows = list ? [...list.querySelectorAll(':scope > [data-id]')] : [];
        const nb = rows[Math.min(fd.index, rows.length - 1)];
        el = nb?.querySelector('.name') || list?.closest('.panel')?.querySelector('.body .btn');
      }
    } else el = match(fd.inSettings ? $('#settingsPanel') || root : root);
    if (el) el.focus({ preventScroll: true });
  }
  function focusItem(id) { setTimeout(() => $(`#editor [data-id="${id}"] .name`)?.focus({ preventScroll: true })); }

  function renderEditor() {
    const root = $('#editor');
    const y = scrollY;
    const sy = $('.settings-col')?.scrollTop || 0;
    const fd = focusDescriptor();
    root.textContent = '';
    root.className = 'editor';
    document.querySelector('.layout').classList.toggle('anim', state.mode === 'anim');
    PL.UI.closePop();
    if (state.mode === 'static') renderStaticEditor(root); else renderAnimEditor(root);
    scrollTo(0, y);
    const sc = $('.settings-col'); if (sc) sc.scrollTop = sy;
    restoreFocus(fd);
  }
  function renderStage() {
    const root = $('#stage');
    root.textContent = '';
    codePre = null; outputGetter = null;
    if (state.mode === 'static') {
      pv = previewPanel('static');
      root.append(pv.el, staticOutput());
      updateStaticPreview();
      rt.texCv = null;
    } else animStage(root);
    updateOutput();
  }
  function renderAll() {
    modeSeg.setValue(state.mode);
    document.title = (state.mode === 'static' ? 'Static paint' : 'Animated paint') + ' - cyex paints';
    renderEditor(); renderStage();
    rt.dirty = true;
  }

  cacheDocImages(state.anim);
  renderAll();
  updateUndo();
  if (pendingNotice) toast(...pendingNotice);
})(window.PL);
