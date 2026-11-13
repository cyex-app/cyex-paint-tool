/* Renders an animated paint document to frames. */
(function (PL) {
  'use strict';
  const { fract, clamp, buildLut } = PL;

  const DEFAULT_XF = { scale: 1, rotate: 0, ox: 0, oy: 0, sx: 0, sy: 0, spin: 0, tile: true };
  const DEFAULT_TWEAK = { hue: 0, sat: 1, bright: 0, contrast: 1, tint: '#ffffff', tintAmt: 0 };

  function defaults(def) { const o = {}; for (const p of def.params) o[p.k] = PL.clone(p.d); return o; }
  // Accept older or hand-written values: stops arrays where a palette is expected and the reverse.
  function fixParams(def, params) {
    const p = Object.assign(defaults(def), params || {});
    for (const d of def.params) {
      const v = p[d.k];
      if (d.t === 'palette' && Array.isArray(v)) p[d.k] = PL.stopsToPalette(v, d.d.loop);
      if (d.t === 'stops' && v && v.colors) p[d.k] = PL.paletteToStops(v);
    }
    return p;
  }

  function newLayer(type, over = {}) {
    const def = PL.LAYERS[type];
    return Object.assign({ id: PL.uid('l'), type, name: def.name, visible: true, blend: 'normal', opacity: 1 }, over, {
      params: fixParams(def, over.params), xf: Object.assign({}, DEFAULT_XF, over.xf || {}), tweak: Object.assign({}, DEFAULT_TWEAK, over.tweak || {}),
    });
  }
  function newEffect(type, over = {}) {
    const def = PL.EFFECTS[type];
    return Object.assign({ id: PL.uid('e'), type, name: def.name, visible: true }, over, { params: fixParams(def, over.params) });
  }
  function blankDoc() {
    return { name: 'Unnamed Paint', width: 256, height: 64, fps: 25, duration: 2, layers: [], effects: [], shadows: [], tweak: Object.assign({}, DEFAULT_TWEAK) };
  }
  const frameCount = (doc) => Math.max(1, Math.round(doc.duration * doc.fps));

  function prepParams(def, params) {
    const p = fixParams(def, params);
    for (const d of def.params) {
      if (d.t === 'stops') p['_' + d.k] = buildLut(p[d.k]);
      if (d.t === 'palette') p['_' + d.k] = buildLut(PL.paletteToStops(p[d.k]));
    }
    if (def.prepare) def.prepare(p);
    return p;
  }

  // Colour tweak compiled to a function on [r,g,b] (0..1), or null when it does nothing.
  function compileTweak(tw) {
    tw = Object.assign({}, DEFAULT_TWEAK, tw || {});
    if (!tw.hue && tw.sat === 1 && !tw.bright && tw.contrast === 1 && !tw.tintAmt) return null;
    const a = (tw.hue * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    const m = [0.213 + c * 0.787 - s * 0.213, 0.715 - c * 0.715 - s * 0.715, 0.072 - c * 0.072 + s * 0.928,
      0.213 - c * 0.213 + s * 0.143, 0.715 + c * 0.285 + s * 0.14, 0.072 - c * 0.072 - s * 0.283,
      0.213 - c * 0.213 - s * 0.787, 0.715 - c * 0.715 + s * 0.715, 0.072 + c * 0.928 + s * 0.072];
    const tint = PL.hexToRgb(tw.tint).map((x) => x / 255);
    return (o) => {
      let r = o[0], g = o[1], b = o[2];
      if (tw.hue) { const R = m[0] * r + m[1] * g + m[2] * b, G = m[3] * r + m[4] * g + m[5] * b, B = m[6] * r + m[7] * g + m[8] * b; r = R; g = G; b = B; }
      if (tw.sat !== 1) { const l = PL.luma(r, g, b); r = l + (r - l) * tw.sat; g = l + (g - l) * tw.sat; b = l + (b - l) * tw.sat; }
      if (tw.contrast !== 1) { r = (r - 0.5) * tw.contrast + 0.5; g = (g - 0.5) * tw.contrast + 0.5; b = (b - 0.5) * tw.contrast + 0.5; }
      if (tw.bright) { r += tw.bright; g += tw.bright; b += tw.bright; }
      if (tw.tintAmt) { const l = PL.luma(r, g, b); r = PL.mix(r, l * tint[0] * 1.6, tw.tintAmt); g = PL.mix(g, l * tint[1] * 1.6, tw.tintAmt); b = PL.mix(b, l * tint[2] * 1.6, tw.tintAmt); }
      o[0] = clamp(r); o[1] = clamp(g); o[2] = clamp(b);
      return o;
    };
  }

  function compile(doc) {
    return {
      W: doc.width | 0, H: doc.height | 0, frames: frameCount(doc),
      layers: doc.layers.filter((l) => l.visible && PL.LAYERS[l.type]).map((l) => ({ def: PL.LAYERS[l.type], p: prepParams(PL.LAYERS[l.type], l.params), xf: Object.assign({}, DEFAULT_XF, l.xf), blend: l.blend, opacity: l.opacity, tweak: compileTweak(l.tweak) })),
      effects: doc.effects.filter((e) => e.visible && PL.EFFECTS[e.type]).map((e) => ({ def: PL.EFFECTS[e.type], p: prepParams(PL.EFFECTS[e.type], e.params) })),
      tweak: compileTweak(doc.tweak),
    };
  }

  // Scratch canvas for layers that draw with the 2D canvas API (scene elements).
  let scratch = null, sctx = null;
  function scratchFor(W, H) {
    if (!scratch) { scratch = document.createElement('canvas'); sctx = scratch.getContext('2d', { willReadFrequently: true }); }
    if (scratch.width !== W || scratch.height !== H) { scratch.width = W; scratch.height = H; }
    sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.globalAlpha = 1; sctx.globalCompositeOperation = 'source-over'; sctx.filter = 'none'; sctx.shadowBlur = 0; sctx.shadowColor = 'transparent';
    sctx.clearRect(0, 0, W, H);
    return sctx;
  }
  function drawLayer(L, t, c) {
    const { W, H } = c, ctx = scratchFor(W, H), xf = L.xf;
    const ident = xf.scale === 1 && !xf.rotate && !xf.ox && !xf.oy && !xf.sx && !xf.sy && !xf.spin;
    const once = (dx, dy) => {
      ctx.save();
      if (!ident || dx || dy) {
        ctx.translate(W / 2 + (xf.ox + t * xf.sx) * W + dx, H / 2 + (xf.oy + t * xf.sy) * H + dy);
        ctx.rotate(((xf.rotate + 360 * xf.spin * t) * Math.PI) / 180);
        ctx.scale(xf.scale, xf.scale);
        ctx.translate(-W / 2, -H / 2);
      }
      L.def.draw(ctx, t, L.p, c);
      ctx.restore();
    };
    once(0, 0);
    if (xf.tile && (xf.sx || xf.ox)) { once(-W, 0); once(W, 0); }
    if (xf.tile && (xf.sy || xf.oy)) { once(0, -H); once(0, H); }
    return ctx.getImageData(0, 0, W, H).data;
  }

  // Render one moment (t in 0..1) at any size. Returns a straight-alpha Float32Array RGBA buffer.
  function renderBuf(cp, t, W = cp.W, H = cp.H, frame = 0) {
    const buf = new Float32Array(W * H * 4);
    const c = { W, H, A: W / H, frame, frames: cp.frames };
    const o = [0, 0, 0, 0];
    for (const L of cp.layers) {
      const { def, p, xf, tweak } = L;
      if (def.draw) {
        const d = drawLayer(L, t, c);
        for (let i = 0; i < d.length; i += 4) {
          const a = d[i + 3] / 255;
          if (a <= 0 && L.blend !== 'mask') continue;
          o[0] = d[i] / 255; o[1] = d[i + 1] / 255; o[2] = d[i + 2] / 255;
          if (tweak) tweak(o);
          PL.blendPx(buf, i, o, a * L.opacity, L.blend);
        }
        continue;
      }
      const ident = xf.scale === 1 && !xf.rotate && !xf.ox && !xf.oy && !xf.sx && !xf.sy && !xf.spin;
      const rot = ((xf.rotate + 360 * xf.spin * t) * Math.PI) / 180, cr = Math.cos(-rot), sr = Math.sin(-rot), A = c.A, inv = 1 / (xf.scale || 1);
      for (let y = 0, i = 0; y < H; y++) {
        const v0 = (y + 0.5) / H;
        for (let x = 0; x < W; x++, i += 4) {
          let u = (x + 0.5) / W, v = v0;
          if (!ident) {
            const X = (u - 0.5) * A, Y = v - 0.5;
            const rx = X * cr - Y * sr, ry = X * sr + Y * cr;
            u = (rx * inv) / A + 0.5 - xf.ox - t * xf.sx;
            v = ry * inv + 0.5 - xf.oy - t * xf.sy;
            if (xf.tile) { u = fract(u); v = fract(v); }
          }
          def.sample(u, v, t, p, o, c);
          if (tweak) tweak(o);
          PL.blendPx(buf, i, o, clamp(o[3]) * L.opacity, L.blend);
        }
      }
    }
    let out = buf;
    for (const E of cp.effects) out = E.def.run(out, W, H, t, E.p, c) || out;
    if (cp.tweak) { const tw = cp.tweak; for (let i = 0; i < out.length; i += 4) { o[0] = out[i]; o[1] = out[i + 1]; o[2] = out[i + 2]; tw(o); out[i] = o[0]; out[i + 1] = o[1]; out[i + 2] = o[2]; } }
    return out;
  }
  function toImageData(buf, W, H) {
    const img = new ImageData(W, H), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = buf[i] * 255; d[i + 1] = buf[i + 1] * 255; d[i + 2] = buf[i + 2] * 255; d[i + 3] = clamp(buf[i + 3]) * 255;
    }
    return img;
  }
  function renderFrame(cp, index, W, H) {
    const t = index / cp.frames;
    return toImageData(renderBuf(cp, t, W || cp.W, H || cp.H, index), W || cp.W, H || cp.H);
  }

  PL.Engine = { newLayer, newEffect, blankDoc, frameCount, compile, renderBuf, renderFrame, toImageData, defaults, fixParams, DEFAULT_XF, DEFAULT_TWEAK };
})(window.PL);
