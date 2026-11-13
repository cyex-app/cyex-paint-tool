/* cyex paints: animated preview playback, drag-to-place and file drop. */
(function (PL) {
  'use strict';
  const { h, icon, iconBtn, toast } = PL.UI;
  const E = PL.Engine;
  const A = (PL.App = PL.App || {});
  const $ = A.$; // store.js loads first

  // ---- animated preview + playback ----
  const rt = { cp: null, cache: [], dirty: true, playing: !matchMedia('(prefers-reduced-motion: reduce)').matches, frame: 0, start: performance.now(), shown: -1, redraw: true, texCv: null, ui: null };

  function animStage(root) {
    const p = A.previewPanel('anim');
    A.pv = p;
    const d = A.state.anim;
    rt.texCv = h('canvas', { class: 'tex', width: d.width, height: d.height, 'aria-label': 'Paint image, current frame', role: 'img' });
    const playB = iconBtn(rt.playing ? 'pause' : 'play', rt.playing ? 'Pause' : 'Play', togglePlay, { attrs: { 'data-hint': 'Space' } });
    const scrub = h('input', { type: 'range', min: 0, max: E.frameCount(d) - 1, step: 1, value: 0, 'aria-label': 'Frame' });
    scrub.addEventListener('input', () => { rt.playing = false; setPlayIcon(); rt.frame = +scrub.value; rt.redraw = true; });
    const fno = h('span', { class: 'frameno' });
    p.el.querySelector('.body').append(h('div', { class: 'sub' }, h('span', { class: 'label' }, 'Paint image'), rt.texCv, h('div', { class: 'transport' }, playB, scrub, fno)));
    rt.ui = { playB, scrub, fno };
    root.append(p.el, A.animOutput());
    rt.redraw = true; rt.dirty = true;
    rt.touchSel = null; // new canvases: the next tick sets their touch-action
    enableCanvasDrag(rt.texCv, (cv, e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; });
    A.pv.names.forEach((cv) => enableCanvasDrag(cv, (c, e) => {
      // the name canvas has shadow padding around the text box the paint is stretched over
      const r = c.getBoundingClientRect(), pad = A.shadowPad(A.state.anim.shadows);
      return [(e.clientX - r.left - pad) / (r.width - 2 * pad), (e.clientY - r.top - pad) / (r.height - 2 * pad)];
    }));
  }

  // Drag on the paint image (or a big preview name) to place the selected element or centre point.
  function dragTarget() {
    const s = A.findSel(); if (!s) return null;
    const def = s.kind === 'layer' ? PL.LAYERS[s.item.type] : PL.EFFECTS[s.item.type];
    // only real positions: x/y on elements, and cx/cy where they mean a centre (Checker and Cells use cx/cy for columns and rows)
    const byKey = Object.fromEntries(def.params.map((p) => [p.k, p]));
    if (byKey.x && byKey.y) return { item: s.item, p: s.item.params, kx: 'x', ky: 'y', bx: 'toX', by: 'toY' };
    if (byKey.cx && byKey.cy && /^Centre/.test(byKey.cx.l)) return { item: s.item, p: s.item.params, kx: 'cx', ky: 'cy' };
    return null;
  }
  // While something draggable is selected, touch on the paint image and the big names places it
  // instead of scrolling the page; otherwise they scroll as usual. Checked when the selection changes.
  function syncTouch() {
    const ta = dragTarget() ? 'none' : '';
    if (rt.texCv) rt.texCv.style.touchAction = ta;
    if (A.pv && A.pv.names) A.pv.names.forEach((cv) => { cv.style.touchAction = ta; });
  }
  function enableCanvasDrag(cv, toUV) {
    cv.addEventListener('pointerenter', () => { cv.style.cursor = dragTarget() ? 'move' : ''; });
    cv.addEventListener('pointerdown', (e) => {
      const tg = dragTarget();
      if (!tg || e.button !== 0) return;
      e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (_) {}
      const useB = e.shiftKey && tg.bx && tg.p.motion === 'path';
      const kx = useB ? tg.bx : tg.kx, ky = useB ? tg.by : tg.ky;
      // an animated position gets a key at the playhead instead of a new plain value
      const keyed = A.kf && (A.kf.animated(tg.item, 'params.' + kx) || A.kf.animated(tg.item, 'params.' + ky));
      if (keyed) pause();
      const isKeyed = (k) => keyed && A.kf.animated(tg.item, 'params.' + k);
      const put = (k, val) => { if (isKeyed(k)) A.kf.put(tg.item, 'params.' + k, val); else tg.p[k] = val; };
      // at the key limit nothing moves (x and y together), with one toast per drag
      const why = keyed ? [kx, ky].filter(isKeyed).map((k) => A.kf.limit(tg.item, 'params.' + k)).find(Boolean) : '';
      let warned = false;
      const set = (ev) => {
        if (why) { if (!warned) { warned = true; toast(why); } return; }
        const [u, v] = toUV(cv, ev);
        put(kx, Math.round(PL.clamp(u, -0.25, 1.25) * 100) / 100); put(ky, Math.round(PL.clamp(v, -0.25, 1.25) * 100) / 100);
        A.changed(false);
      };
      set(e);
      const up = () => {
        cv.removeEventListener('pointermove', set); cv.removeEventListener('pointerup', up); cv.removeEventListener('pointercancel', up);
        if (A.kf) A.kf.endGesture();
        if (why) return; // nothing changed
        const old = $('#settingsPanel'), s = A.findSel();
        if (old && s) { const fd = A.focusDescriptor(); old.replaceWith(A.settingsPanel(s)); A.restoreFocus(fd); }
        A.changed(true);
      };
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
        const msg = A.loadJson(obj);
        A.renderAll(); A.commit(); toast(msg, "success");
      } catch (err) { toast("Couldn’t open " + json.name + ". Check it’s a paint or project file.", "error"); console.warn(err); }
      return;
    }
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return;
    if (A.state.mode !== 'anim') { A.state.mode = 'anim'; }
    for (const f of imgs) {
      try {
        const src = await A.fileToDataUrl(f, 512); await A.cacheImage(src);
        const l = E.newLayer('sprite', { name: f.name.replace(/\.[^.]+$/, '').slice(0, 30), params: { src } });
        A.state.anim.layers.push(l); A.state.sel = { kind: 'layer', id: l.id };
      } catch (err) { toast('Couldn’t read ' + (f.name.length > 40 ? f.name.slice(0, 37) + '…' : f.name) + '. Try a PNG, JPG or WebP file.', 'error'); }
    }
    A.renderAll(); A.commit(); toast(imgs.length > 1 ? `Added ${imgs.length} pictures.` : 'Added the picture as an element. Drag it on the paint image to place it.', 'success');
  });
  function setPlayIcon() { if (!rt.ui) return; const b = rt.ui.playB; b.replaceChildren(icon(rt.playing ? 'pause' : 'play')); b.setAttribute('aria-label', rt.playing ? 'Pause' : 'Play'); b.dataset.tip = rt.playing ? 'Pause' : 'Play'; }
  function togglePlay() { rt.playing = !rt.playing; if (rt.playing) rt.start = performance.now() - (rt.frame / A.state.anim.fps) * 1000; setPlayIcon(); }
  function pause() { if (!rt.playing) return; rt.playing = false; setPlayIcon(); }

  // ---- playhead API (the timeline and the keyframe buttons use these) ----
  // The current moment, always on a whole frame: { frame, frames, t } with t = frame / frames.
  function now() {
    const n = E.frameCount(A.state.anim), f = ((Math.round(rt.frame) % n) + n) % n;
    return { frame: f, frames: n, t: f / n };
  }
  // Jump to moment t (0..1, snapped to a frame). Playback keeps running from there if it was playing.
  function seek(t) {
    const n = E.frameCount(A.state.anim);
    const f = ((Math.round((Number(t) || 0) * n) % n) + n) % n;
    rt.frame = f; rt.redraw = true;
    if (rt.playing) rt.start = performance.now() - (f / A.state.anim.fps) * 1000;
    emitFrame(f, n);
  }
  // Every change of the shown frame fires 'paint:frame' on document with { frame, frames, t }.
  // Listeners can be registered at load time, before this file runs.
  const FRAME_EVENT = 'paint:frame';
  let emitted = { f: -1, n: -1 };
  function emitFrame(f, n) {
    if (emitted.f === f && emitted.n === n) return;
    emitted = { f, n };
    document.dispatchEvent(new CustomEvent(FRAME_EVENT, { detail: { frame: f, frames: n, t: f / n } }));
  }

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
    if (A.state.mode !== 'anim' || !rt.texCv) return;
    const sel = A.state.sel ? A.state.sel.kind + ':' + A.state.sel.id : '';
    if (sel !== rt.touchSel) { rt.touchSel = sel; syncTouch(); }
    if (rt.broken && !rt.dirty) return;
    if (document.querySelector('.backdrop')) return; // a dialog covers the preview
    try { step(now); rt.broken = false; }
    catch (e) { console.error(e); rt.broken = true; rt.dirty = false; toast('Couldn’t draw this paint. Undo the last change or remove the layer that broke it.', 'error'); }
  }
  function step(now) {
    const d = A.state.anim;
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
    emitFrame(rt.frame, n);
    if (!rt.redraw && rt.shown === rt.frame) return;
    if (A.pv && A.pv.el && A.pv.el.querySelector('.body')?.hidden) { rt.redraw = true; return; } // collapsed preview: nothing to draw
    const img = getFrame(rt.frame);
    rt.texCv.getContext('2d').putImageData(img, 0, 0);
    const text = A.state.preview.text, color = A.state.preview.color;
    A.pv.names.forEach((cv, i) => A.drawNameCanvas(cv, text, A.SIZES[i], rt.texCv, color, d.shadows));
    A.pv.chatNames.forEach((cv) => A.drawNameCanvas(cv, text, 13, rt.texCv, color, d.shadows));
    rt.ui.scrub.value = rt.frame;
    rt.ui.fno.textContent = `${String(rt.frame + 1).padStart(String(n).length, '0')} / ${n}`;
    rt.shown = rt.frame; rt.redraw = false;
  }
  requestAnimationFrame(tick);

  Object.assign(A, { rt, animStage, togglePlay, pause, seek, now, FRAME_EVENT });
})(window.PL);
