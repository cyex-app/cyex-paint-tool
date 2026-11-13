/* cyex paints: My library. Your own layers and effects, kept in this browser:
   - picture: an uploaded image, added as an Image layer;
   - saved: any layer or effect with its settings ("Save to My library" in its settings);
   - code: a layer or effect written as a small JavaScript function (see engine.js, registerCustom).
   A paint that uses code carries that code (doc.custom). Code from someone else's file only runs after
   the person says yes. The library dialog (dialogs.js) lists these next to the built-in items. */
(function (PL) {
  'use strict';
  const { h, icon, btn, dialog, toast, download, slug, labeled } = PL.UI;
  const E = PL.Engine, clone = PL.clone;
  const A = (PL.App = PL.App || {});
  const KEY = 'cyexPaints.lib.v1';
  const TYPES = { image: 'Picture', recipe: 'Saved', code: 'Code' };

  // ---- storage ----
  const str = (v, n) => String(v ?? '').slice(0, n);
  function cleanItem(x) {
    if (!x || typeof x !== 'object' || !/^u_[A-Za-z0-9_]{1,40}$/.test(x.id) || !TYPES[x.type] || !['layer', 'effect'].includes(x.kind)) return null;
    const it = { id: x.id, kind: x.kind, type: x.type, name: str(x.name, 64) || 'Untitled', tags: (Array.isArray(x.tags) ? x.tags : []).map((t) => str(t, 24).toLowerCase().trim()).filter(Boolean).slice(0, 12), created: Number(x.created) || Date.now(), data: {} };
    const d = x.data || {};
    if (x.type === 'image') { if (typeof d.src !== 'string' || !d.src.startsWith('data:image/') || d.src.length > 4e6) return null; it.data.src = d.src; }
    if (x.type === 'code') { if (typeof d.code !== 'string') return null; it.data.code = d.code.slice(0, 20000); it.data.labels = (Array.isArray(d.labels) ? d.labels : []).slice(0, 3).map((l) => str(l, 24)); }
    if (x.type === 'recipe') {
      const parts = (Array.isArray(d.parts) ? d.parts : []).filter((p) => p && ['layer', 'effect'].includes(p.kind) && p.obj && typeof p.obj.type === 'string').slice(0, 20);
      if (!parts.length) return null;
      it.data.parts = parts.map((p) => ({ kind: p.kind, obj: clone(p.obj) }));
      it.data.custom = E.cleanCustom(d.custom);
    }
    return it;
  }
  let items = [];
  try { const raw = JSON.parse(localStorage.getItem(KEY) || '[]'); items = (Array.isArray(raw) ? raw : []).map(cleanItem).filter(Boolean); } catch (_) { items = []; }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(items)); return true; }
    catch (e) { toast('Couldn’t save to My library: this browser’s storage is full. Remove a picture or two and try again.', 'error'); return false; }
  }
  const newId = () => 'u_' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  const defIdOf = (it) => 'custom_' + it.id.slice(2);
  const customOf = (it) => ({ kind: it.kind, name: it.name, code: it.data.code, labels: it.data.labels || [] });
  // your own library is trusted: its code is registered when the page opens
  function registerItem(it) { if (it.type === 'code') E.registerCustom({ [defIdOf(it)]: customOf(it) }); if (it.type === 'recipe' && it.data.custom) E.registerCustom(it.data.custom); }
  items.forEach(registerItem);

  // Code that the person already has: in My library, or in the paint that is open.
  function knownCode() {
    const s = new Set();
    for (const it of items) { if (it.type === 'code') s.add(it.data.code); for (const c of Object.values((it.data && it.data.custom) || {})) s.add(c.code); }
    for (const c of Object.values((A.state && A.state.anim && A.state.anim.custom) || {})) s.add(c.code);
    return s;
  }
  // How many code items in a document's custom block aren't already the person's own.
  function foreignCode(doc) {
    const known = knownCode();
    return Object.values(E.cleanCustom(doc && doc.custom)).filter((c) => !known.has(c.code)).length;
  }
  // The same document without any custom code layers or effects.
  function withoutCode(doc) {
    const d = clone(doc || {});
    d.custom = {};
    if (Array.isArray(d.layers)) d.layers = d.layers.filter((l) => !(l && E.CUSTOM_ID.test(l.type)));
    if (Array.isArray(d.effects)) d.effects = d.effects.filter((e) => !(e && E.CUSTOM_ID.test(e.type)));
    return d;
  }
  // Asked once a paint with someone else's code has opened with that code switched off.
  function askRunCode(obj, n) {
    let dlg = null;
    const run = () => { dlg.close(); const msg = A.loadJson(obj, { trusted: true }); A.renderAll(); A.commit('Turned on custom code'); toast(msg, 'success'); };
    dlg = dialog('Run custom code', [
      h('p', null, `This paint has ${n} custom code ${n === 1 ? 'item' : 'items'} that ${n === 1 ? 'isn’t' : 'aren’t'} in My library. It opened without ${n === 1 ? 'it' : 'them'}.`),
      h('p', { class: 'hint' }, 'Code runs in this page with the same access as the editor, including your saved paints. Only run code from people you trust.'),
    ], { footer: [btn('Keep it off', () => dlg.close(), 'primary'), btn('Run the code', run, 'secondary', 'code')] });
  }

  // ---- entries for the library dialog and its search ----
  const typeDesc = (it) => (it.type === 'image' ? 'Your picture, as an image layer.' : it.type === 'code' ? 'Your code.' : `Saved ${it.kind} with its settings.`);
  function libEntries(kind) {
    return items.filter((it) => it.kind === kind).map((it) => ({ key: 'U:' + it.id, kind, name: it.name, cat: 'My library', desc: typeDesc(it), tags: [...it.tags, TYPES[it.type].toLowerCase(), 'my library', 'mine'], user: it, badge: TYPES[it.type] }));
  }
  // A small document showing the item, for thumbnails (null for pictures, which are drawn directly).
  function previewDoc(it, base) {
    const doc = E.blankDoc();
    if (it.type === 'image') return null;
    if (it.type === 'code') { const id = defIdOf(it); E.registerCustom({ [id]: customOf(it) }); if (it.kind === 'layer') doc.layers = [E.newLayer(id)]; else { doc.layers = base(); doc.effects = [E.newEffect(id)]; } return doc; }
    if (it.data.custom) E.registerCustom(it.data.custom);
    for (const p of it.data.parts) {
      const store = p.kind === 'layer' ? PL.LAYERS : PL.EFFECTS;
      if (!store[p.obj.type]) continue;
      if (p.kind === 'layer') doc.layers.push(E.newLayer(p.obj.type, clone(p.obj))); else doc.effects.push(E.newEffect(p.obj.type, clone(p.obj)));
    }
    if (!doc.layers.length) doc.layers = base();
    return doc;
  }

  // ---- adding to the paint ----
  function addToDoc(it) {
    const d = A.state.anim;
    if (!d.custom || typeof d.custom !== 'object') d.custom = {};
    let last = null;
    const push = (kind, type, over) => {
      const o = Object.assign(clone(over || {}), { id: PL.uid(kind[0]) });
      if (kind === 'layer') { const l = E.newLayer(type, o); delete l.group; l.clip = false; d.layers.push(l); last = { kind, id: l.id }; }
      else { const e = E.newEffect(type, o); d.effects.push(e); last = { kind, id: e.id }; }
    };
    if (it.type === 'image') { push('layer', 'image', { name: it.name, params: { src: it.data.src } }); A.cacheImage(it.data.src).then(() => { A.rt.dirty = true; A.scheduleThumbs(true); }).catch(() => {}); }
    else if (it.type === 'code') { const id = defIdOf(it); d.custom[id] = customOf(it); E.registerCustom({ [id]: d.custom[id] }); push(it.kind, id, { name: it.name }); }
    else {
      for (const [id, c] of Object.entries(it.data.custom || {})) d.custom[id] = c;
      E.registerCustom(it.data.custom);
      let skipped = 0;
      for (const p of it.data.parts) { if ((p.kind === 'layer' ? PL.LAYERS : PL.EFFECTS)[p.obj.type]) push(p.kind, p.obj.type, p.obj); else skipped++; }
      if (skipped) toast(`Skipped ${skipped} part${skipped > 1 ? 's' : ''} this version doesn’t know.`);
      if (it.data.parts.some((p) => p.obj.type === 'image')) A.cacheDocImages(d);
    }
    if (!last) return false;
    A.state.sel = last;
    A.renderEditor(); A.changed(true); A.focusItem(last.id);
    toast(`Added ${it.name}.`);
    return true;
  }

  // ---- saving a layer or effect ----
  const tagsField = (v) => h('input', { class: 'field', value: v || '', maxlength: 160, 'aria-label': 'Tags', placeholder: 'e.g. gold, shiny, warm' });
  const parseTags = (s) => String(s || '').split(/[,;]+/).map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 12);
  function saveToLibrary(kind, item) {
    const def = (kind === 'layer' ? PL.LAYERS : PL.EFFECTS)[item.type];
    const name = h('input', { class: 'field', value: item.name || (def && def.name) || 'Saved', maxlength: 64, 'aria-label': 'Name', autofocus: true });
    const tags = tagsField((def && def.tags ? def.tags.slice(0, 4) : []).join(', '));
    let dlg = null;
    const save = () => {
      const obj = clone(item); delete obj.id; delete obj.group; obj.clip = false; obj.name = name.value.trim() || obj.name;
      const custom = {}; const dc = (A.state.anim && A.state.anim.custom) || {};
      if (E.CUSTOM_ID.test(obj.type) && dc[obj.type]) custom[obj.type] = clone(dc[obj.type]);
      const it = cleanItem({ id: newId(), kind, type: 'recipe', name: obj.name, tags: parseTags(tags.value), created: Date.now(), data: { parts: [{ kind, obj }], custom } });
      if (!it) { toast('Couldn’t save that. Try again.', 'error'); return; }
      items.unshift(it);
      if (!persist()) { items.shift(); return; }
      dlg.close(); toast(`Saved ${it.name} to My library.`, 'success');
    };
    dlg = dialog('Save to My library', [
      h('p', { class: 'hint' }, `Keeps this ${kind} with all its settings, so you can add it to any paint from Add ${kind === 'layer' ? 'layer' : 'effect'}, My library.`),
      labeled('Name', name), labeled('Tags (for search, separated by commas)', tags),
    ], { footer: [btn('Cancel', () => dlg.close(), 'ghost'), btn('Save', save, 'primary', 'bookmark')] });
  }

  // ---- pictures ----
  async function addImageFiles(files) {
    let added = 0;
    for (const f of [...files].slice(0, 12)) {
      try {
        const src = await A.fileToDataUrl(f, 512);
        const it = cleanItem({ id: newId(), kind: 'layer', type: 'image', name: f.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 64) || 'Picture', tags: ['picture', 'image'], created: Date.now(), data: { src } });
        if (it) { items.unshift(it); added++; }
      } catch (_) { toast(`Couldn’t read ${f.name}. Try a PNG, JPG or WebP file.`, 'error'); }
    }
    if (added && !persist()) { items.splice(0, added); return 0; }
    if (added) toast(`Added ${added} picture${added > 1 ? 's' : ''} to My library.`, 'success');
    return added;
  }

  // ---- code editor ----
  const TEMPLATES = {
    layer: [
      ['Colour bands', '// u, v: 0..1 across the paint. t: 0..1 over the loop.\n// Write red, green, blue, alpha (0..1) into o, or let H.palette(f) pick a colour from your palette.\nH.palette(u * 3 - t * p.speed);'],
      ['Pulsing rings', '// rings from the middle; slider A sets how many, B how soft\nconst d = Math.hypot((u - 0.5) * c.A, v - 0.5);\nconst f = H.fract(d * (2 + p.a * 30) - t * p.speed);\nH.palette(f);\no[3] = H.smoothstep(0, 0.1 + p.b * 0.4, f);'],
      ['Noise clouds', '// soft noise churning in a loop: H.fbm(x, y, period x, period y, detail, seed)\nconst a = H.TAU * t * p.speed;\nconst n = H.fbm(u * 8 + Math.cos(a) * p.a, v * 2 + Math.sin(a) * p.a, 8, 2, 4, 1);\nH.palette(n * (0.5 + p.b * 2));'],
      ['Sparkle grid', '// a grid of dots that twinkle; B sets the size\nconst gx = u * 32, gy = v * 8, cx = Math.floor(gx), cy = Math.floor(gy);\nconst r = Math.hypot(H.fract(gx) - 0.5, H.fract(gy) - 0.5);\nconst tw = 0.5 + 0.5 * Math.sin(H.TAU * (t * p.speed + H.hash(cx, cy, 7)));\nH.palette(H.hash(cx, cy, 3));\no[3] = H.smoothstep(0.1 + p.b * 0.4, 0.05, r) * tw;'],
    ],
    effect: [
      ['Tint by brightness', '// o holds this pixel’s red, green, blue, alpha (0..1). Change it.\nconst l = H.luma(o[0], o[1], o[2]);\nconst keep = [o[0], o[1], o[2]];\nH.palette(l + t * p.speed);\nfor (let k = 0; k < 3; k++) o[k] = H.mix(keep[k], o[k], p.a);'],
      ['Wave warp', '// read the image somewhere else with H.get(u, v)\nconst s = H.get(u + Math.sin(H.TAU * (v * 2 + t * p.speed)) * p.a * 0.05, v);\no[0] = s[0]; o[1] = s[1]; o[2] = s[2]; o[3] = s[3];'],
      ['Scan bars', '// dark bars rolling down the paint\nconst bar = 0.5 + 0.5 * Math.sin(H.TAU * (v * 6 - t * p.speed));\nconst k = 1 - p.a * bar;\no[0] *= k; o[1] *= k; o[2] *= k;'],
    ],
  };
  // it: a library code item to edit, or null for a new one. opts.doc: edit the code inside the open paint instead.
  function openCodeEditor(kind, it, opts = {}) {
    const src = it ? customOf(it) : opts.custom || { kind, name: kind === 'layer' ? 'My code layer' : 'My code effect', code: TEMPLATES[kind][0][1], labels: [] };
    const name = h('input', { class: 'field', value: src.name, maxlength: 64, 'aria-label': 'Name' });
    const labels = [0, 1, 2].map((i) => h('input', { class: 'field', value: src.labels[i] || '', maxlength: 24, placeholder: 'Value ' + 'ABC'[i], 'aria-label': `Name of slider ${'ABC'[i]}` }));
    const code = h('textarea', { class: 'code codeedit', spellcheck: false, rows: 12, 'aria-label': 'Code', autofocus: true });
    code.value = src.code;
    const tags = it ? tagsField(it.tags.join(', ')) : opts.doc ? null : tagsField('');
    const status = h('p', { class: 'hint code-status', role: 'status', 'aria-live': 'polite' });
    const cv = h('canvas', { width: 256, height: 64, class: 'code-preview', 'aria-hidden': 'true' });
    const tmpl = h('div', { class: 'row tmpl' }, h('span', { class: 'label' }, 'Start from'), TEMPLATES[kind].map(([n, c]) => btn(n, () => { code.value = c; rebuild(); code.focus(); }, 'ghost small')));
    // Tab types two spaces in the code box; Escape still closes the dialog
    code.addEventListener('keydown', (e) => {
      if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); const a = code.selectionStart, b = code.selectionEnd; code.setRangeText('  ', a, b, 'end'); code.dispatchEvent(new Event('input')); }
    });
    // live preview: registered under a preview id, rendered a frame at a time
    const PID = 'custom_preview_' + kind;
    let doc = null, cp = null, frame = 0, raf = 0, last = 0, timer = 0, alive = true;
    const base = () => [E.newLayer('linear', { params: { stops: clone(PL.PALETTES.sunset), angle: 90, speed: 1 } }), E.newLayer('clouds', { params: { stops: clone(PL.PALETTES.mono) }, blend: 'overlay', opacity: 0.7 })];
    function rebuild() {
      const c = { kind, name: name.value || 'Preview', code: code.value, labels: labels.map((l) => l.value) };
      PL.Engine.registerCustom({ [PID]: c });
      const def = (kind === 'layer' ? PL.LAYERS : PL.EFFECTS)[PID];
      doc = E.blankDoc(); doc.width = 256; doc.height = 64;
      if (kind === 'layer') doc.layers = [E.newLayer(PID)]; else { doc.layers = base(); doc.effects = [E.newEffect(PID)]; }
      try { cp = E.compile(doc); } catch (e) { cp = null; }
      frame = 0; draw();
      status.textContent = def.error ? 'Problem: ' + def.error : 'Runs fine. The preview plays the full loop.';
      status.classList.toggle('bad', !!def.error);
    }
    function draw() {
      if (!cp) return;
      cv.getContext('2d').putImageData(E.renderFrame(cp, frame % cp.frames), 0, 0);
      const def = (kind === 'layer' ? PL.LAYERS : PL.EFFECTS)[PID];
      if (def && def.error && !status.classList.contains('bad')) { status.textContent = 'Problem: ' + def.error; status.classList.add('bad'); }
    }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    function tick(now) {
      if (!alive) return;
      if (!cv.isConnected) { alive = false; return; }
      if (now - last > 80 && !reduced) { last = now; frame++; draw(); }
      raf = requestAnimationFrame(tick);
    }
    const later = () => { clearTimeout(timer); timer = setTimeout(rebuild, 350); };
    code.addEventListener('input', later); labels.forEach((l) => l.addEventListener('input', later));

    let dlg = null;
    const save = () => {
      const c = { kind, name: name.value.trim() || src.name, code: code.value, labels: labels.map((l) => l.value.trim()) };
      if (opts.doc) { opts.onSave(c); dlg.close(); return; }
      let target = it;
      if (!target) { target = cleanItem({ id: newId(), kind, type: 'code', name: c.name, tags: [], created: Date.now(), data: { code: c.code, labels: c.labels } }); items.unshift(target); }
      const before = clone(target);
      Object.assign(target, { name: c.name, tags: parseTags(tags.value), data: { code: c.code, labels: c.labels } });
      if (!persist()) { if (it) Object.assign(it, before); else items.shift(); return; }
      registerItem(target);
      // the open paint uses this code: update its copy too
      const id = defIdOf(target), d = A.state.anim;
      if (d.custom && d.custom[id]) { d.custom[id] = customOf(target); E.registerCustom({ [id]: d.custom[id] }); A.rt.dirty = true; A.renderEditor(); A.changed(true); }
      dlg.close();
      toast(`${it ? 'Updated' : 'Saved'} ${target.name} in My library.`, 'success');
      if (opts.onSaved) opts.onSaved(target);
    };
    dlg = dialog(it || opts.doc ? `Edit code: ${src.name}` : kind === 'layer' ? 'New code layer' : 'New code effect', [
      h('div', { class: 'code-top' }, cv, h('div', { class: 'stack' }, labeled('Name', name), tags ? labeled('Tags (for search, separated by commas)', tags) : null)),
      tmpl,
      labeled('Code', h('div', { class: 'stack code-wrap' }, h('code', { class: 'code-sig' }, kind === 'layer' ? 'function (u, v, t, p, o, c, H) {' : 'function (o, u, v, t, p, c, H) {'), code, h('code', { class: 'code-sig' }, '}'))),
      status,
      h('details', { class: 'code-help' }, h('summary', null, 'What you can use'),
        h('ul', null,
          h('li', null, kind === 'layer' ? 'u, v: position, 0 to 1 across and down. Write red, green, blue and alpha (0 to 1) into o[0] to o[3].' : 'o: this pixel’s red, green, blue and alpha (0 to 1); change them. u, v: its position. H.get(u, v) reads the image anywhere.'),
          h('li', null, 't: 0 to 1 over the loop. Use H.TAU * t * p.speed (whole turns) so the loop has no seam.'),
          h('li', null, 'p.a, p.b, p.c: the three sliders (0 to 1). p.speed: whole cycles per loop. H.palette(f) writes the palette colour at f into o.'),
          h('li', null, 'c.A: width divided by height. c.W, c.H: size in pixels.'),
          h('li', null, 'H has TAU, clamp, fract, mix, smoothstep, tri, noise(x, y, px, py, seed), fbm(x, y, px, py, detail, seed), hash(x, y, seed), hsv(h, s, v), luma(r, g, b).'))),
      h('div', { class: 'split3' }, labels.map((l, i) => labeled(`Slider ${'ABC'[i]} name`, l))),
      h('p', { class: 'hint' }, 'Code runs in this page. Only paste code you trust.'),
    ], { wide: true, footer: [btn('Cancel', () => dlg.close(), 'ghost'), btn('Save', save, 'primary', 'save')], onClose: () => { alive = false; cancelAnimationFrame(raf); clearTimeout(timer); } });
    dlg.box.classList.add('code-dialog');
    rebuild(); raf = requestAnimationFrame(tick);
  }
  // "Edit code" on a custom layer or effect in the open paint
  function editCustomInDoc(item) {
    const id = item.type, d = A.state.anim, mine = items.find((it) => it.type === 'code' && defIdOf(it) === id);
    if (mine) { openCodeEditor(mine.kind, mine); return; }
    const c = d.custom && d.custom[id];
    if (!c) { toast('This paint doesn’t have that code any more.', 'error'); return; }
    openCodeEditor(c.kind, null, { doc: true, custom: clone(c), onSave: (nc) => { d.custom[id] = nc; E.registerCustom({ [id]: nc }); A.rt.dirty = true; A.renderEditor(); A.changed(true); toast('Code updated in this paint.', 'success'); } });
  }

  // ---- managing items ----
  function removeItem(it) { const i = items.indexOf(it); if (i < 0) return; items.splice(i, 1); if (!persist()) items.splice(i, 0, it); }
  function renameItem(it, name) { const old = it.name; it.name = str(name, 64).trim() || old; if (!persist()) it.name = old; }
  function exportLibrary() {
    if (!items.length) { toast('My library is empty, so there’s nothing to export.'); return; }
    download(new Blob([JSON.stringify({ cyexPaintsLibrary: 1, items })], { type: 'application/json' }), 'my-library.cyexlib.json');
  }
  async function importLibrary(file, done) {
    let list;
    try { const obj = JSON.parse(await file.text()); list = (obj && Array.isArray(obj.items) ? obj.items : Array.isArray(obj) ? obj : null); } catch (_) { list = null; }
    if (!list) { toast('Couldn’t read that file. Pick a My library export (.json).', 'error'); return; }
    const clean = list.slice(0, 500).map(cleanItem).filter(Boolean);
    if (!clean.length) { toast('That file has nothing this version can add.', 'error'); return; }
    const known = knownCode();
    const hasCode = (it) => (it.type === 'code' && !known.has(it.data.code)) || (it.type === 'recipe' && Object.values(it.data.custom || {}).some((c) => !known.has(c.code)));
    const coded = clean.filter(hasCode).length;
    const commit = (withCode) => {
      const add = clean.filter((it) => withCode || !hasCode(it)).map((it) => Object.assign(it, { id: items.some((x) => x.id === it.id) ? newId() : it.id }));
      items.unshift(...add);
      if (!persist()) { items.splice(0, add.length); return; }
      add.forEach(registerItem);
      toast(`Added ${add.length} item${add.length === 1 ? '' : 's'} to My library.`, 'success');
      if (done) done();
    };
    if (!coded) { commit(false); return; }
    let dlg = null;
    dlg = dialog('Import code', [
      h('p', null, `${coded} of the ${clean.length} items in this file ${coded === 1 ? 'is' : 'are'} custom code.`),
      h('p', { class: 'hint' }, 'Code runs in this page with the same access as the editor, including your saved paints. Only add code from people you trust.'),
    ], { footer: [btn('Cancel', () => dlg.close(), 'ghost'), btn('Add without code', () => { dlg.close(); commit(false); }, 'primary'), btn('Add with code', () => { dlg.close(); commit(true); }, 'secondary', 'code')] });
  }

  Object.assign(A, {
    userLib: { items: () => items, entries: libEntries, previewDoc, add: addToDoc, remove: removeItem, rename: renameItem, addImageFiles, openCodeEditor, exportLibrary, importLibrary, TYPES },
    saveToLibrary, editCustomInDoc, foreignCode, withoutCode, askRunCode,
  });
})(window.PL);
