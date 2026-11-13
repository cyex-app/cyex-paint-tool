/* cyex paints: shared editors, the static editor, the preview panel, static export and import. */
(function (PL) {
  'use strict';
  const { h, icon, iconBtn, btn, panel, slider, seg, checkbox, labeled, select, colorField, stopsEditor, sortable, grip, dialog, toast, download, copyText, slug } = PL.UI;
  const E = PL.Engine, Paint = PL.Paint, clone = PL.clone;
  const A = (PL.App = PL.App || {});

  // =====================================================================================
  // Shared editors
  // =====================================================================================
  function nameField(obj) {
    const inp = h('input', { class: 'field', value: obj.name, maxlength: 64, 'aria-label': 'Paint name', oninput: () => { obj.name = inp.value; A.changed(false); }, onchange: () => A.commit() });
    return labeled('Paint name', inp);
  }

  // opts: title (panel title), noun (used in labels), empty (hint when the list is empty). Defaults are the drop shadows.
  function shadowsPanel(list, opts = {}) {
    const title = opts.title || 'Shadows', noun = opts.noun || 'shadow', Noun = noun[0].toUpperCase() + noun.slice(1);
    const body = h('div', { class: 'stops' });
    let render = () => {
      body.textContent = '';
      if (!list.length) body.append(h('p', { class: 'hint' }, opts.empty || 'No shadows. 7TV draws each one as a CSS drop-shadow, in order.'));
      list.forEach((s, i) => {
        const { hex, alpha } = PL.decToHexAlpha(s.color);
        body.append(h('div', { class: 'shadow-row sortable-item' }, grip(`Move ${noun} ${i + 1}`),
          slider(`${Noun} ${i + 1} X`, s.x_offset, { min: -10, max: 10, step: 0.5, unit: 'px', onInput: (v) => { s.x_offset = v; A.changed(false); }, onCommit: () => A.commit() }),
          slider(`${Noun} ${i + 1} Y`, s.y_offset, { min: -10, max: 10, step: 0.5, unit: 'px', onInput: (v) => { s.y_offset = v; A.changed(false); }, onCommit: () => A.commit() }),
          slider(`${Noun} ${i + 1} blur`, s.radius, { min: 0, max: 20, step: 0.5, unit: 'px', onInput: (v) => { s.radius = v; A.changed(false); }, onCommit: () => A.commit() }),
          iconBtn('trash', `Remove ${noun} ${i + 1}`, () => { list.splice(i, 1); render(); A.changed(true); const j = Math.min(i, list.length - 1); (body.querySelectorAll(`[aria-label^="Remove ${noun}"]`)[j] || add).focus(); }, { cls: 'sm danger' }),
          colorField(hex, alpha, (hx, a, c) => { s.color = PL.hexAlphaToDec(hx, a); A.changed(c); }, { label: `${Noun} ${i + 1}` })));
      });
    };
    render();
    sortable(body, (from, to) => { const [x] = list.splice(from, 1); list.splice(to, 0, x); render(); A.changed(true); });
    const add = btn(`Add ${noun}`, () => { list.push({ x_offset: 0, y_offset: 0, radius: 2, color: PL.hexAlphaToDec('#000000', 0.8) }); render(); A.changed(true); }, 'secondary small', 'plus');
    const sec = panel(title, [body, h('div', { class: 'row' }, add)], [], { count: list.length || null });
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
  const LAYER_FUNCS = [['LINEAR_GRADIENT', 'Linear'], ['RADIAL_GRADIENT', 'Radial'], ['CONIC_GRADIENT', 'Conic'], ['URL', 'Image']];
  const LAYER_NAMES = { LINEAR_GRADIENT: 'Linear', RADIAL_GRADIENT: 'Radial', CONIC_GRADIENT: 'Conic', URL: 'Image' };
  const REPEAT_OPTIONS = [['no-repeat', 'No repeat'], ['repeat', 'Repeat both ways'], ['repeat-x', 'Repeat across'], ['repeat-y', 'Repeat down'], ['round', 'Round'], ['space', 'Space']];
  const collapsedLayers = new WeakSet(); // layers whose card is folded; keyed by object, so it survives reordering
  const defaultStops = () => [{ at: 0, color: PL.hexAlphaToDec('#ffffff', 0.6) }, { at: 1, color: PL.hexAlphaToDec('#ffffff', 0) }];

  function renderStaticEditor(root) {
    const p = Paint.ensure(A.state.static);
    const isUrl = p.function === 'URL';
    const layered = p.layered;
    // Classic is one gradient; Layered is the 7TV gradients[] format with a text style.
    const formatCtl = seg([['classic', 'Classic'], ['layered', 'Layered']], layered ? 'layered' : 'classic', (v) => {
      if (v === 'layered') Paint.toLayered(p);
      else {
        const lost = p.gradients.length > 1 || Paint.textHas(p.text);
        Paint.toClassic(p);
        if (lost) toast('Back to one gradient. Only the first layer was kept. Undo brings the rest back.');
      }
      A.renderEditor(); A.changed(true);
    }, 'Paint format');
    const formatHint = h('p', { class: 'hint' }, layered
      ? 'Layered stacks gradients, each with its own size, position and repeat, and adds a text style. A single plain gradient with no text style still exports as classic JSON.'
      : 'Classic is one gradient over the whole name. Switch to Layered to stack gradients or style the text.');
    const paintBody = [nameField(p), labeled('Format', formatCtl), formatHint];
    if (layered) {
      root.append(panel('Paint', paintBody), layersPanel(p), ...textStylePanels(p), shadowsPanel(p.shadows));
      return;
    }
    const typeCtl = seg([['LINEAR_GRADIENT', 'Linear'], ['RADIAL_GRADIENT', 'Radial'], ['URL', 'Image URL']], p.function, (v) => { p.function = v; A.renderEditor(); A.changed(true); }, 'Function');
    paintBody.push(labeled('Function', typeCtl));
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

  // ---- Layered mode: the gradients[] list ----
  function layersPanel(p) {
    const list = p.gradients;
    const body = h('div', { class: 'stops layers' });
    let sec = null, add = null;
    const newLayer = () => Paint.blankGradient({ stops: defaultStops() });

    function layerCard(g, i) {
      const n = i + 1, pctOpts = { min: 0, max: 1, step: 0.01, scale: 100, unit: '%', decimals: 0 };
      const thumb = h('i');
      const paintThumb = () => { thumb.style.backgroundImage = Paint.gradientCss(g); thumb.style.backgroundSize = g.function === 'URL' ? 'cover' : ''; };
      paintThumb();
      const on = () => { paintThumb(); A.changed(false); }, done = () => A.commit();
      const folded = collapsedLayers.has(g);
      const fields = h('div', { class: 'layer-body', hidden: folded });
      const toggle = h('button', { type: 'button', class: 'layer-toggle', 'aria-expanded': String(!folded), onclick: () => {
        const open = fields.hidden; fields.hidden = !open; toggle.setAttribute('aria-expanded', String(open));
        if (open) collapsedLayers.delete(g); else collapsedLayers.add(g);
      } }, icon('chevron'), h('span', { class: 'layer-title' }, `Layer ${n}`, h('small', null, LAYER_NAMES[g.function] + (i === 0 ? ' · top' : ''))));

      const isUrl = g.function === 'URL';
      if (!isUrl && !g.stops.length) g.stops = defaultStops();
      fields.append(labeled('Function', seg(LAYER_FUNCS, g.function, (v) => { g.function = v; if (v !== 'URL' && !g.stops.length) g.stops = defaultStops(); swapCard(i, { i, group: `Layer ${n} function` }); A.changed(true); }, `Layer ${n} function`)));
      if (g.function === 'LINEAR_GRADIENT') fields.append(slider('Angle', g.angle ?? 90, { min: 0, max: 360, step: 1, unit: '°', onInput: (v) => { g.angle = v; on(); }, onCommit: done }));
      if (g.function === 'RADIAL_GRADIENT') fields.append(labeled('Shape', seg([['circle', 'Circle'], ['ellipse', 'Ellipse']], g.shape, (v) => { g.shape = v; on(); A.commit(); }, `Layer ${n} shape`)));
      if (g.function === 'CONIC_GRADIENT') fields.append(h('p', { class: 'hint' }, '7TV starts a conic gradient at the top and runs it clockwise, so there is no angle.'));
      if (isUrl) {
        const url = h('input', { class: 'field mono', value: g.image_url || '', placeholder: 'https://…/layer.png', spellcheck: false, 'aria-label': `Layer ${n} image URL`, oninput: () => { g.image_url = url.value.trim(); on(); }, onchange: done });
        fields.append(labeled('Image URL', url), h('p', { class: 'hint' }, 'With automatic size the image keeps its own size; set a size to stretch it over the name.'));
      } else fields.append(checkbox('Repeating gradient', !!g.repeat, (v) => { g.repeat = v; on(); A.commit(); }));

      // size, position and tiling (background-size, background-position, background-repeat)
      const auto = g.size == null;
      if (!g.at) g.at = [0, 0];
      const sizeRow = auto ? null : h('div', { class: 'split' },
        slider('Width', g.size[0], Object.assign({}, pctOpts, { max: 4, onInput: (v) => { g.size[0] = v; on(); }, onCommit: done })),
        slider('Height', g.size[1], Object.assign({}, pctOpts, { max: 4, onInput: (v) => { g.size[1] = v; on(); }, onCommit: done })));
      fields.append(h('div', { class: 'sub' }, h('span', { class: 'label' }, 'Size, position and repeat'),
        checkbox(isUrl ? 'Automatic size (the image’s own size)' : 'Automatic size (the whole name)', auto, (v) => { g.size = v ? null : [1, 1]; swapCard(i); A.changed(true); }),
        sizeRow,
        h('div', { class: 'split' },
          slider('Position X', g.at[0], Object.assign({}, pctOpts, { onInput: (v) => { g.at[0] = v; on(); }, onCommit: done })),
          slider('Position Y', g.at[1], Object.assign({}, pctOpts, { onInput: (v) => { g.at[1] = v; on(); }, onCommit: done }))),
        labeled('Repeat', select(REPEAT_OPTIONS, REPEAT_OPTIONS.some(([v]) => v === g.canvas_repeat) ? g.canvas_repeat : 'repeat', (v) => { g.canvas_repeat = v; on(); A.commit(); }, `Layer ${n} repeat`))));

      if (!isUrl) {
        const ed = stopsEditor(Paint.editorStops(g), (stops, c) => {
          g.stops = stops.map((s) => ({ at: Math.round(s.at * 10000) / 10000, color: PL.hexAlphaToDec(s.color, s.a) }));
          on(); if (c) done();
        }, { palettes: true });
        fields.append(h('div', { class: 'sub' }, h('span', { class: 'label' }, 'Colour stops'), ed));
      }

      const dup = iconBtn('dup', `Duplicate layer ${n}`, () => {
        if (list.length >= Paint.MAX_LAYERS) { toast(`A paint can have up to ${Paint.MAX_LAYERS} layers.`); return; }
        list.splice(i + 1, 0, PL.clone(g)); render({ i: i + 1, first: true }); A.changed(true);
      }, { cls: 'sm' });
      const del = iconBtn('trash', `Remove layer ${n}`, () => {
        list.splice(i, 1); render(null); A.changed(true);
        const j = Math.min(i, list.length - 1);
        (body.querySelectorAll('[aria-label^="Remove layer"]:not([disabled])')[j] || add).focus();
      }, { cls: 'sm danger', attrs: { disabled: list.length <= 1 } });
      return h('div', { class: 'layer-card sortable-item', role: 'group', 'aria-label': `Layer ${n}` },
        h('div', { class: 'layer-head' }, grip(`Move layer ${n}`), toggle, h('span', { class: 'layer-sw' }, thumb), dup, del), fields);
    }
    // Focus survives a rebuild: remember the focused control (card index, group, label or position) and find it again.
    const FOCUSABLE = 'button, input, select, textarea, [tabindex="0"]';
    function captureFocus() {
      const a = document.activeElement;
      if (!a || !body.contains(a)) return null;
      const card = a.closest('.layer-card');
      if (!card) return null;
      const spec = { i: [...body.children].indexOf(card), nth: [...card.querySelectorAll(FOCUSABLE)].indexOf(a), label: a.getAttribute('aria-label') };
      const grp = a.closest('[role="radiogroup"]'), chk = a.closest('label.check');
      if (grp) spec.group = grp.getAttribute('aria-label');
      if (chk) spec.check = chk.textContent;
      return spec;
    }
    function restoreFocus(spec) {
      if (!spec || !body.children.length) return;
      const card = body.children[Math.min(spec.i, body.children.length - 1)];
      const all = [...card.querySelectorAll(FOCUSABLE)];
      const ok = (x) => x && !x.disabled && x.offsetParent !== null;
      let el = null;
      if (spec.first) el = card.querySelector('.grip');
      else if (spec.group) { const g = [...card.querySelectorAll('[role="radiogroup"]')].find((x) => x.getAttribute('aria-label') === spec.group); el = g && g.querySelector('[aria-checked="true"]'); }
      else if (spec.check) { const l = [...card.querySelectorAll('label.check')].find((x) => x.textContent === spec.check); el = l && l.querySelector('input'); }
      else if (spec.label) el = all.find((x) => x.getAttribute('aria-label') === spec.label);
      if (!ok(el)) el = all[spec.nth];
      if (!ok(el)) el = card.querySelector('.layer-toggle');
      if (el) el.focus();
    }
    // Rebuild one card in place (a Function or size change only affects that card).
    function swapCard(i, spec = captureFocus()) {
      const old = body.children[i];
      if (!old) { render(spec); return; }
      body.replaceChild(layerCard(list[i], i), old);
      restoreFocus(spec);
    }
    // Rebuild the whole list. spec: undefined keeps the focused control, null leaves focus alone, an object picks one.
    function render(spec = captureFocus()) {
      body.textContent = '';
      list.forEach((g, i) => body.append(layerCard(g, i)));
      if (add) {
        const full = list.length >= Paint.MAX_LAYERS;
        add.setAttribute('aria-disabled', String(full)); // not disabled: focus stays and the tooltip still shows
        add.dataset.tip = full ? `A paint can have up to ${Paint.MAX_LAYERS} layers.` : '';
      }
      if (sec) sec.setCount(list.length);
      restoreFocus(spec);
    }
    sortable(body, (from, to) => { const [x] = list.splice(from, 1); list.splice(to, 0, x); render(null); A.changed(true); });
    add = btn('Add layer', () => {
      if (list.length >= Paint.MAX_LAYERS) { toast(`A paint can have up to ${Paint.MAX_LAYERS} layers.`); return; }
      list.unshift(newLayer()); render({ i: 0, first: true }); A.changed(true);
    }, 'secondary small', 'plus');
    render(null);
    sec = panel('Gradient layers', [h('p', { class: 'hint' }, '7TV draws the first layer on top. A layer’s size and position are fractions of the name box.'), body, h('div', { class: 'row' }, add)], [], { count: list.length });
    return sec;
  }

  // ---- Layered mode: paint.data.text (font weight, outline, text shadows, text transform) ----
  function textStylePanels(p) {
    const t = p.text, on = () => A.changed(false), done = () => A.commit();
    const strokeHost = h('div', { class: 'stops' });
    const renderStroke = () => {
      strokeHost.textContent = '';
      if (!t.stroke) return;
      const { hex, alpha } = PL.decToHexAlpha(t.stroke.color);
      strokeHost.append(h('div', { class: 'split' },
        slider('Outline width', t.stroke.width, { min: 0, max: 8, step: 0.25, unit: 'px', onInput: (v) => { t.stroke.width = v; on(); }, onCommit: done }),
        labeled('Outline colour', colorField(hex, alpha, (hx, a, c) => { t.stroke.color = PL.hexAlphaToDec(hx, a); A.changed(c); }, { label: 'Outline colour' }))));
    };
    renderStroke();
    const body = [
      slider('Weight', t.weight, { min: 0, max: 9, step: 1, scale: 100, decimals: 0, onInput: (v) => { t.weight = v; on(); }, onCommit: done }),
      h('p', { class: 'hint' }, 'Steps of 100 from 100 to 900. 0 keeps the default, 700. Heavy weights only show if the chat font has them.'),
      checkbox('Outline', !!t.stroke, (v) => { t.stroke = v ? { color: PL.hexAlphaToDec('#000000', 1), width: 1 } : null; renderStroke(); A.changed(true); }),
      strokeHost,
      labeled('Text transform', seg([['', 'None'], ['uppercase', 'Uppercase'], ['lowercase', 'Lowercase']], t.transform || '', (v) => { t.transform = v; A.changed(true); }, 'Text transform')),
    ];
    return [panel('Text style', body), shadowsPanel(t.shadows, { title: 'Text shadows', noun: 'text shadow', empty: 'No text shadows. 7TV draws each one as a CSS text-shadow, over the paint.' })];
  }

  // =====================================================================================
  // Preview panel (shared shell)
  // =====================================================================================
  // A chat mock (styles in css/preview.css). Badges are flat squares with a letter, no emotes or artwork.
  // Name colours come from the chat tokens, so they read on the chat backdrop whatever the app theme.
  const SIZES = [36, 24, 18];
  const BADGES = { mod: 'M', sub: 'S', vip: 'V' };
  // [time, badges, who, colour (null = you), message parts (string or { me: true })]
  const CHAT = [
    ['14:02', ['mod', 'sub'], 'quietoak', 'green', ['that paint is clean']],
    ['14:02', ['sub'], 'nora_byte', 'cyan', ['how long did the gradient take']],
    ['14:02', ['sub'], null, null, ['thanks, built it right here']],
    ['14:03', [], 'pixelmoth', 'pink', ['the edges stay sharp on the dark side']],
    ['14:03', ['vip'], 'mosswren', 'yellow', ['does it hold up on light mode too']],
    ['14:03', ['sub'], null, null, ['checking that next']],
    ['14:04', ['sub'], 'tallpine_', 'purple', ['chat is moving fast']],
    ['14:04', ['mod'], 'quietoak', 'green', ['@', { me: true }, ' that one looks great, ship it']],
  ];

  function previewPanel(kind) {
    const pv = A.state.preview;
    const text = h('input', { class: 'field', value: pv.text, maxlength: 25, 'aria-label': 'Preview name', oninput: () => { pv.text = text.value || ' '; refreshPreview(); A.save(); } });
    const color = colorField(pv.color, null, (hx) => { pv.color = hx; refreshPreview(); A.save(); }, { label: 'Name colour' });
    const bg = seg([['dark', 'Dark chat'], ['light', 'Light chat'], ['checker', 'Transparent']], pv.bg, (v) => { pv.bg = v; box.className = 'stagebox ' + v; A.save(); }, 'Backdrop');
    const stamps = checkbox('Show timestamps', pv.ts !== false, (v) => { pv.ts = v; chat.classList.toggle('no-ts', !v); A.save(); });
    const box = h('div', { class: 'stagebox ' + pv.bg, id: 'stagebox' });
    const ctl = h('div', { class: 'split' }, labeled('Preview name', text), labeled('Name colour', color));
    const body = [ctl, h('p', { class: 'hint' }, 'The name colour shows through any transparent part of the paint, as it does in 7TV.'), h('div', { class: 'row' }, bg, stamps)];
    const p = panel('Preview', [], [], { id: 'previewPanel' });
    p.querySelector('.body').append(...body);
    p.querySelector('.body').prepend(box);
    // big samples
    const names = SIZES.map((px) => (kind === 'static' ? h('span', { class: 'pname painted', 'aria-hidden': 'true', style: { fontSize: px + 'px' } }) : h('canvas', { class: 'pname', 'aria-hidden': 'true' })));
    // chat mock: your painted name sits in three messages, so chatNames has three entries
    const chat = h('div', { class: 'tchat' + (pv.ts === false ? ' no-ts' : ''), 'aria-hidden': 'true' });
    const chatNames = [];
    const mkMe = (cls) => {
      const el = kind === 'static' ? h('span', { class: cls + ' painted' }) : h('canvas', { class: cls });
      chatNames.push(el); return el;
    };
    for (const [ts, badges, who, col, parts] of CHAT) {
      const nameEl = who ? h('span', { class: 'twho', 'data-c': col }, who) : mkMe('twho me');
      chat.append(h('div', { class: 'tmsg' },
        h('span', { class: 'tts' }, ts),
        badges.length ? h('span', { class: 'tbadges' }, badges.map((b) => h('span', { class: 'tbadge tb-' + b }, BADGES[b]))) : null,
        nameEl, h('span', { class: 'tsep' }, ': '),
        h('span', { class: 'ttext' }, parts.map((x) => (typeof x === 'string' ? x : mkMe('twho me'))))));
    }
    box.append(...names, chat);
    const sr = h('span', { class: 'sr-only' }, 'Painted name preview of ' + A.state.preview.text);
    box.append(sr);
    return { el: p, names, chatNames, box, sr };
  }

  A.pv = null; // current preview handles
  function refreshPreview() {
    if (A.pv && A.pv.sr) A.pv.sr.textContent = 'Painted name preview of ' + A.state.preview.text;
    if (A.state.mode === 'static') updateStaticPreview(); else A.rt.redraw = true;
  }

  function updateStaticPreview() {
    if (!A.pv || A.state.mode !== 'static') return;
    const p = A.state.static, st = Paint.styleFor(p);
    for (const el of [...A.pv.names, ...A.pv.chatNames]) {
      el.textContent = A.state.preview.text;
      const s = el.style;
      s.color = A.state.preview.color;
      s.backgroundImage = st.backgroundImage; s.backgroundPosition = st.backgroundPosition; s.backgroundSize = st.backgroundSize; s.backgroundRepeat = st.backgroundRepeat;
      s.filter = st.filter;
      s.fontWeight = st.fontWeight; s.textShadow = st.textShadow; s.textTransform = st.textTransform;
      s.setProperty('-webkit-text-stroke-width', st.strokeWidth); s.setProperty('-webkit-text-stroke-color', st.strokeColor);
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
      h('div', { class: 'sub' }, h('span', { class: 'label' }, 'Animate'), h('p', { class: 'hint' }, 'Turns this gradient into a layer you can move, then add effects, sparkles or materials on top. A layered paint hands over its top layer only.'), h('div', null, toAnim)),
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
    if (p.layered) {
      // every layer composed with its own size, position and repeat; image layers are loaded first
      const imgs = [];
      for (let i = 0; i < p.gradients.length; i++) {
        const g = p.gradients[i];
        if (g.function !== 'URL') continue;
        if (!g.image_url) throw Object.assign(new Error(`Add an image link to layer ${i + 1} first.`), { friendly: true });
        const safe = Paint.safeUrl(g.image_url);
        if (!safe) throw Object.assign(new Error(`Layer ${i + 1} needs an http or https image link.`), { friendly: true });
        imgs[i] = await loadImage(safe);
      }
      const lc = Paint.composeLayers(p, w, hh, imgs);
      try { lc.getContext('2d').getImageData(0, 0, 1, 1); } catch (e) { throw Object.assign(new Error('That host blocks reading the image, so it can be previewed but not exported.'), { friendly: true }); }
      return lc;
    }
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

  // --- painted name with the layered text style (weight, outline, text shadows, text transform) ---
  const nameFont = () => getComputedStyle(document.documentElement).getPropertyValue('--name-font').trim() || 'system-ui, sans-serif';
  const styledCtx = document.createElement('canvas').getContext('2d');
  function styledMeasure(label, px, weight) {
    styledCtx.font = `${weight} ${px}px ${nameFont()}`;
    const m = styledCtx.measureText(label || ' ');
    const asc = m.fontBoundingBoxAscent ?? px * 0.95, desc = m.fontBoundingBoxDescent ?? px * 0.25;
    return { w: Math.max(1, Math.ceil(m.width)), asc, h: Math.ceil(asc + desc) };
  }
  const styledLabel = (text, t) => (t.transform === 'uppercase' ? text.toUpperCase() : t.transform === 'lowercase' ? text.toLowerCase() : text);
  // How far the outline and text shadows reach past the text box.
  function textReach(t) {
    let r = t.stroke ? t.stroke.width / 2 + 1 : 0;
    for (const s of t.shadows) r = Math.max(r, Math.abs(s.x_offset) + s.radius * 2 + 2, Math.abs(s.y_offset) + s.radius * 2 + 2);
    return Math.ceil(r);
  }
  // Order as in the browser with a transparent fill: paint clipped to the glyphs, then the text shadows over it
  // (the first shadow on top), then the outline, then the drop shadows around the whole result.
  function paintStyledName(ctx, x, y, tex, color, dropShadows, t, m, label, px, weight) {
    const e = textReach(t), font = `${weight} ${px}px ${nameFont()}`;
    const wk = h('canvas', { width: m.w + e * 2, height: m.h + e * 2 }), wc = wk.getContext('2d');
    const fill = h('canvas', { width: m.w, height: m.h }), fc = fill.getContext('2d');
    fc.fillStyle = color; fc.fillRect(0, 0, m.w, m.h);
    if (tex) { fc.imageSmoothingEnabled = true; fc.imageSmoothingQuality = 'high'; fc.drawImage(tex, 0, 0, m.w, m.h); }
    fc.globalCompositeOperation = 'destination-in';
    fc.font = font; fc.textBaseline = 'alphabetic'; fc.fillStyle = '#000'; fc.fillText(label, 0, m.asc);
    wc.drawImage(fill, e, e);
    wc.font = font; wc.textBaseline = 'alphabetic';
    const FAR = 4000; // draw the glyphs far off canvas so only their shadow lands inside
    for (let i = t.shadows.length - 1; i >= 0; i--) {
      const s = t.shadows[i];
      wc.save();
      wc.shadowColor = PL.decToCss(s.color); wc.shadowBlur = s.radius; wc.shadowOffsetX = s.x_offset + FAR; wc.shadowOffsetY = s.y_offset;
      wc.fillStyle = '#000'; wc.fillText(label, e - FAR, e + m.asc);
      wc.restore();
    }
    if (t.stroke && t.stroke.width > 0) {
      wc.lineWidth = t.stroke.width; wc.strokeStyle = PL.decToCss(t.stroke.color); wc.lineJoin = 'miter';
      wc.strokeText(label, e, e + m.asc);
    }
    ctx.save();
    ctx.filter = dropShadows && dropShadows.length ? dropShadows.map(Paint.shadowCss).join(' ') : 'none';
    ctx.drawImage(wk, x - e, y - e);
    ctx.restore();
  }
  async function staticNameCanvas(px) {
    const p = A.state.static, name = A.state.preview.text;
    if (p.layered && Paint.textHas(p.text)) {
      const t = p.text, weight = t.weight > 0 ? t.weight * 100 : 700, label = styledLabel(name, t);
      const m = styledMeasure(label, px, weight), pad = A.shadowPad(p.shadows) + textReach(t);
      const tex = await staticTexture(p, m.w, m.h);
      const cv = h('canvas', { width: m.w + pad * 2, height: m.h + pad * 2 });
      paintStyledName(cv.getContext('2d'), pad, pad, tex, A.state.preview.color, p.shadows, t, m, label, px, weight);
      return cv;
    }
    const m = A.measure(name, px), pad = A.shadowPad(p.shadows);
    const tex = await staticTexture(p, m.w, m.h); // CSS gradients are laid out on the name box itself
    const cv = h('canvas', { width: m.w + pad * 2, height: m.h + pad * 2 });
    A.paintName(cv.getContext('2d'), pad, pad, name, px, tex, A.state.preview.color, p.shadows, 1);
    return cv;
  }

  function openImport() {
    const ta = h('textarea', { class: 'code', spellcheck: false, placeholder: '{ "name": "Unnamed Paint", "function": "LINEAR_GRADIENT", … }', 'aria-label': 'Paint JSON' });
    const file = h('input', { type: 'file', accept: '.json,application/json', class: 'sr-only', onchange: async () => { if (file.files[0]) ta.value = await file.files[0].text(); } });
    const d = dialog('Import a paint', [
      h('p', { class: 'hint' }, 'Paste 7TV paint JSON, either the classic single gradient or the layered format with gradients and text. Colours can be 7TV integers or hex strings. Animated project files open in the Animated tab.'),
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
    const g = p.layered && p.gradients[0] ? p.gradients[0] : p; // layered paints hand over their top layer
    if (g.function === 'URL' || !g.stops.length) return doc;
    let stops = Paint.editorStops(g), count = 1;
    if (g.repeat && stops.length > 1) {
      const f = stops[0].at, l = stops[stops.length - 1].at;
      if (l - f > 0) { count = Math.round((1 / (l - f)) * 4) / 4 || 1; stops = stops.map((s) => Object.assign({}, s, { at: (s.at - f) / (l - f) })); }
    }
    doc.layers.push(g.function === 'RADIAL_GRADIENT'
      ? E.newLayer('radial', { params: { stops, count, speed: 0, circle: g.shape === 'circle' } })
      : E.newLayer('linear', { params: { stops, angle: g.angle ?? 90, count, speed: 0 } }));
    return doc;
  }

  Object.assign(A, { nameField, shadowsPanel, tweakControls, renderStaticEditor, previewPanel, updateStaticPreview, codeBox, updateOutput, staticOutput, loadImage, SIZES });
})(window.PL);
