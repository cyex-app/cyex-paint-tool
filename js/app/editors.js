/* cyex paints: shared editors, the static editor, the preview panel, static export and import. */
(function (PL) {
  'use strict';
  const { h, icon, iconBtn, btn, panel, slider, seg, checkbox, labeled, colorField, stopsEditor, sortable, grip, dialog, toast, download, copyText, slug } = PL.UI;
  const E = PL.Engine, Paint = PL.Paint, clone = PL.clone;
  const A = (PL.App = PL.App || {});

  // =====================================================================================
  // Shared editors
  // =====================================================================================
  function nameField(obj) {
    const inp = h('input', { class: 'field', value: obj.name, maxlength: 64, 'aria-label': 'Paint name', oninput: () => { obj.name = inp.value; A.changed(false); }, onchange: () => A.commit() });
    return labeled('Paint name', inp);
  }

  function shadowsPanel(list) {
    const body = h('div', { class: 'stops' });
    let render = () => {
      body.textContent = '';
      if (!list.length) body.append(h('p', { class: 'hint' }, 'No shadows. 7TV draws each one as a CSS drop-shadow, in order.'));
      list.forEach((s, i) => {
        const { hex, alpha } = PL.decToHexAlpha(s.color);
        body.append(h('div', { class: 'shadow-row sortable-item' }, grip(`Move shadow ${i + 1}`),
          slider(`Shadow ${i + 1} X`, s.x_offset, { min: -10, max: 10, step: 0.5, unit: 'px', onInput: (v) => { s.x_offset = v; A.changed(false); }, onCommit: () => A.commit() }),
          slider(`Shadow ${i + 1} Y`, s.y_offset, { min: -10, max: 10, step: 0.5, unit: 'px', onInput: (v) => { s.y_offset = v; A.changed(false); }, onCommit: () => A.commit() }),
          slider(`Shadow ${i + 1} blur`, s.radius, { min: 0, max: 20, step: 0.5, unit: 'px', onInput: (v) => { s.radius = v; A.changed(false); }, onCommit: () => A.commit() }),
          iconBtn('trash', `Remove shadow ${i + 1}`, () => { list.splice(i, 1); render(); A.changed(true); const j = Math.min(i, list.length - 1); (body.querySelectorAll('[aria-label^="Remove shadow"]')[j] || add).focus(); }, { cls: 'sm danger' }),
          colorField(hex, alpha, (hx, a, c) => { s.color = PL.hexAlphaToDec(hx, a); A.changed(c); }, { label: `Shadow ${i + 1}` })));
      });
    };
    render();
    sortable(body, (from, to) => { const [x] = list.splice(from, 1); list.splice(to, 0, x); render(); A.changed(true); });
    const add = btn('Add shadow', () => { list.push({ x_offset: 0, y_offset: 0, radius: 2, color: PL.hexAlphaToDec('#000000', 0.8) }); render(); A.changed(true); }, 'secondary small', 'plus');
    const sec = panel('Shadows', [body, h('div', { class: 'row' }, add)], [], { count: list.length || null });
    const baseRender = render; render = () => { baseRender(); sec.setCount(list.length); }; // keep the header count in step
    return sec;
  }

  function tweakControls(tw, hint) {
    const on = (v) => A.changed(false), done = () => A.changed(true);
    return [
      h('p', { class: 'hint' }, hint),
      slider('Hue shift', tw.hue, { min: -180, max: 180, step: 1, unit: '°', onInput: (v) => { tw.hue = v; on(); }, onCommit: done }),
      h('div', { class: 'split' },
        slider('Saturation', tw.sat, { min: 0, max: 2, step: 0.01, scale: 100, unit: '%', decimals: 0, onInput: (v) => { tw.sat = v; on(); }, onCommit: done }),
        slider('Brightness', tw.bright, { min: -0.5, max: 0.5, step: 0.01, scale: 100, decimals: 0, onInput: (v) => { tw.bright = v; on(); }, onCommit: done }),
        slider('Contrast', tw.contrast, { min: 0.2, max: 2, step: 0.01, scale: 100, unit: '%', decimals: 0, onInput: (v) => { tw.contrast = v; on(); }, onCommit: done }),
        slider('Tint amount', tw.tintAmt, { min: 0, max: 1, step: 0.01, scale: 100, unit: '%', decimals: 0, onInput: (v) => { tw.tintAmt = v; on(); }, onCommit: done })),
      labeled('Tint colour', colorField(tw.tint, null, (hx, a, c) => { tw.tint = hx; c ? done() : on(); }, { label: 'Tint colour' })),
      h('div', null, btn('Reset colours', () => { Object.assign(tw, E.DEFAULT_TWEAK); A.renderEditor(); done(); }, 'ghost small', 'reset')),
    ];
  }

  // =====================================================================================
  // Static editor
  // =====================================================================================
  function renderStaticEditor(root) {
    const p = A.state.static;
    const isUrl = p.function === 'URL';
    const typeCtl = seg([['LINEAR_GRADIENT', 'Linear'], ['RADIAL_GRADIENT', 'Radial'], ['URL', 'Image URL']], p.function, (v) => { p.function = v; A.renderEditor(); A.changed(true); }, 'Function');
    const paintBody = [nameField(p), labeled('Function', typeCtl)];
    if (p.function === 'LINEAR_GRADIENT') paintBody.push(slider('Angle', p.angle, { min: 0, max: 360, step: 1, unit: '°', onInput: (v) => { p.angle = v; A.changed(false); }, onCommit: () => A.commit() }));
    if (p.function === 'RADIAL_GRADIENT') paintBody.push(labeled('Shape', seg([['circle', 'Circle'], ['ellipse', 'Ellipse']], p.shape, (v) => { p.shape = v; A.changed(true); }, 'Shape')));
    if (!isUrl) paintBody.push(checkbox('Repeating gradient', p.repeat, (v) => { p.repeat = v; A.changed(true); }));
    if (isUrl) {
      const url = h('input', { class: 'field mono', value: p.image_url, placeholder: 'https://…/paint.gif', spellcheck: false, 'aria-label': 'Image URL', oninput: () => { p.image_url = url.value.trim(); A.changed(false); }, onchange: () => A.commit() });
      paintBody.push(labeled('Image URL', url), h('p', { class: 'hint' }, '7TV stretches the image over the whole name (background-size 100% 100%). Build animated images in the Animated tab.'));
    }
    root.append(panel('Paint', paintBody));
    if (!isUrl) {
      const es = Paint.editorStops(p);
      let stopsPanel = null; // assigned below; the editor reports counts before the panel exists
      const ed = stopsEditor(es, (stops, c) => {
        p.stops = stops.map((s) => ({ at: Math.round(s.at * 10000) / 10000, color: PL.hexAlphaToDec(s.color, s.a) }));
        A.changed(c);
      }, { palettes: true, onCount: (n) => stopsPanel && stopsPanel.setCount(n) });
      stopsPanel = panel('Colour stops', [ed], [], { count: p.stops.length });
      root.append(stopsPanel);
    }
    root.append(shadowsPanel(p.shadows));
  }

  // =====================================================================================
  // Preview panel (shared shell)
  // =====================================================================================
  const SIZES = [36, 24, 18];
  const CHAT = [['14:02', 'quietoak', '#1e90ff', 'that paint is clean'], ['14:02', null, null, 'thanks, made it myself'], ['14:03', 'nora_byte', '#9acd32', 'how long did the animation take']];
  function previewPanel(kind) {
    const pv = A.state.preview;
    const text = h('input', { class: 'field', value: pv.text, maxlength: 25, 'aria-label': 'Preview name', oninput: () => { pv.text = text.value || ' '; refreshPreview(); A.save(); } });
    const color = colorField(pv.color, null, (hx) => { pv.color = hx; refreshPreview(); A.save(); }, { label: 'Name colour' });
    const bg = seg([['dark', 'Dark chat'], ['light', 'Light chat'], ['checker', 'Transparent']], pv.bg, (v) => { pv.bg = v; box.className = 'stagebox ' + v; A.save(); }, 'Backdrop');
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
    box.append(h('span', { class: 'sr-only' }, 'Painted name preview of ' + A.state.preview.text));
    return { el: p, names, chatNames, box };
  }

  A.pv = null; // current preview handles
  function refreshPreview() { if (A.state.mode === 'static') updateStaticPreview(); else A.rt.redraw = true; }

  function updateStaticPreview() {
    if (!A.pv || A.state.mode !== 'static') return;
    const p = A.state.static, st = Paint.styleFor(p);
    for (const el of [...A.pv.names, ...A.pv.chatNames]) {
      el.textContent = A.state.preview.text;
      el.style.color = A.state.preview.color;
      el.style.backgroundImage = st.backgroundImage;
      el.style.backgroundSize = st.backgroundSize;
      el.style.filter = st.filter;
    }
  }

  // =====================================================================================
  // Output panel (code + exports)
  // =====================================================================================
  A.codeTab = 'json';
  A.codePre = null;
  function codeBox(getText, tabs) {
    A.codePre = h('pre', { class: 'code', tabindex: '0', 'aria-label': 'Paint code' });
    const tabSeg = seg(tabs, A.codeTab, (v) => { A.codeTab = v; updateOutput(); }, 'Code format');
    const copyB = iconBtn('copy', 'Copy code', async () => {
      const ok = await copyText(A.codePre.textContent);
      copyB.replaceChildren(icon(ok ? 'check' : 'copy')); copyB.style.color = ok ? 'var(--green)' : '';
      setTimeout(() => { copyB.replaceChildren(icon('copy')); copyB.style.color = ''; }, 1600);
      if (!ok) toast('Couldn’t copy. Select the code and copy it by hand.', 'error');
    });
    const wrap = h('div', { class: 'code-wrap' }, h('div', { class: 'code-head' }, tabSeg, h('span', { class: 'grow' }), copyB), A.codePre);
    wrap.getText = getText;
    return wrap;
  }
  A.outputGetter = null;
  function updateOutput() { if (A.codePre && A.outputGetter) A.codePre.textContent = A.outputGetter(); }

  function staticOutput() {
    const p = A.state.static;
    A.outputGetter = () => (A.codeTab === 'css' ? Paint.cssText(A.state.static) : Paint.toJson(A.state.static));
    const code = codeBox(A.outputGetter, [['json', '7TV JSON'], ['css', 'CSS']]);
    const importB = btn('Import JSON', openImport, 'secondary small', 'upload');
    const dl = btn('Download JSON', () => download(new Blob([Paint.toJson(A.state.static)], { type: 'application/json' }), slug(A.state.static.name) + '.json'), 'secondary small', 'download');
    const tw = h('input', { class: 'num', value: A.state.texSize[0], 'aria-label': 'PNG width (px)' }), th = h('input', { class: 'num', value: A.state.texSize[1], 'aria-label': 'PNG height (px)' });
    const readSize = () => { A.state.texSize = [Math.max(1, Math.min(4096, parseInt(tw.value) || 256)), Math.max(1, Math.min(2048, parseInt(th.value) || 64))]; tw.value = A.state.texSize[0]; th.value = A.state.texSize[1]; A.save(); return A.state.texSize; };
    tw.onchange = readSize; th.onchange = readSize;
    const nsz = slider('Name size', A.state.nameSize, { min: 12, max: 160, step: 1, unit: 'px', onInput: (v) => { A.state.nameSize = v; A.save(); } });
    const pngTex = btn('Paint PNG', async () => {
      const [w, hh] = readSize();
      try { const cv = await staticTexture(p, w, hh); cv.toBlob((b) => download(b, slug(p.name) + '-paint.png')); }
      catch (e) { toast(e.friendly ? e.message : 'Couldn’t make the PNG. Try a smaller size.', 'error'); }
    }, 'secondary', 'image');
    const pngName = btn('Name PNG', async () => {
      try { const cv = await staticNameCanvas(A.state.nameSize); cv.toBlob((b) => download(b, slug(p.name) + '-name.png')); }
      catch (e) { toast(e.friendly ? e.message : 'Couldn’t make the PNG. Try a smaller size.', 'error'); }
    }, 'secondary', 'image');
    const toAnim = btn('Animate this paint', () => { A.state.anim = staticToAnim(A.state.static); A.state.mode = 'anim'; A.state.sel = A.state.anim.layers[0] ? { kind: 'layer', id: A.state.anim.layers[0].id } : null; A.renderAll(); A.commit(); toast('Copied into the animated editor as a layer.', 'success'); }, 'primary', 'wand');
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
      im.onload = () => res(im); im.onerror = () => rej(Object.assign(new Error('Couldn’t load that image. The host may block other sites from using it.'), { friendly: true }));
      im.src = src;
    });
  }
  async function staticTexture(p, w, hh) {
    const cv = h('canvas', { width: w, height: hh });
    const ctx = cv.getContext('2d');
    if (p.function === 'URL') {
      if (!p.image_url) throw Object.assign(new Error('Add an image link first.'), { friendly: true });
      const safe = Paint.safeUrl(p.image_url);
      if (!safe) throw Object.assign(new Error('Add an http or https image link first.'), { friendly: true });
      const im = await loadImage(safe);
      ctx.drawImage(im, 0, 0, w, hh);
      try { ctx.getImageData(0, 0, 1, 1); } catch (e) { throw Object.assign(new Error('That host blocks reading the image, so it can be previewed but not exported.'), { friendly: true }); }
    } else ctx.putImageData(Paint.rasterize(p, w, hh), 0, 0);
    return cv;
  }
  async function staticNameCanvas(px) {
    const p = A.state.static, m = A.measure(A.state.preview.text, px), pad = A.shadowPad(p.shadows);
    const tex = await staticTexture(p, m.w, m.h); // CSS gradients are laid out on the name box itself
    const cv = h('canvas', { width: m.w + pad * 2, height: m.h + pad * 2 });
    A.paintName(cv.getContext('2d'), pad, pad, A.state.preview.text, px, tex, A.state.preview.color, p.shadows, 1);
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
          const msg = A.loadJson(obj);
          d.close(); A.renderAll(); A.commit(); toast(msg, "success");
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

  Object.assign(A, { nameField, shadowsPanel, tweakControls, renderStaticEditor, previewPanel, updateStaticPreview, codeBox, updateOutput, staticOutput, loadImage, SIZES });
})(window.PL);
