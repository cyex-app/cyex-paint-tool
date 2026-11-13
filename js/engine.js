/* Renders an animated paint document to frames. */
(function (PL) {
  'use strict';
  const { fract, clamp, buildLut } = PL;

  const DEFAULT_XF = { scale: 1, rotate: 0, ox: 0, oy: 0, sx: 0, sy: 0, spin: 0, tile: true };
  const DEFAULT_TWEAK = { hue: 0, sat: 1, bright: 0, contrast: 1, tint: '#ffffff', tintAmt: 0 };

  function defaults(def) { const o = {}; for (const p of def.params) o[p.k] = PL.clone(p.d); return o; }
  // Accept older or hand-written values: stops arrays where a palette is expected and the reverse.
  // Also clamps every value to its definition, so imported or hand-edited projects can't
  // ask for 1e9 copies, NaN sizes or colours that aren't colours.
  const HEX = /^#[0-9a-f]{6}$/i;
  const okHex = (v, d) => (typeof v === 'string' && HEX.test(v) ? v : d);
  function fixParams(def, params) {
    const p = Object.assign(defaults(def), params && typeof params === 'object' ? params : {});
    for (const d of def.params) {
      let v = p[d.k];
      if (d.t === 'palette' && Array.isArray(v)) v = PL.stopsToPalette(v, d.d.loop);
      if (d.t === 'stops' && v && v.colors) v = PL.paletteToStops(v);
      switch (d.t) {
        case 'range': {
          let n = Number(v);
          if (!Number.isFinite(n)) n = d.d;
          n = clamp(n, d.min, d.max);
          if (d.step === 1) n = Math.round(n);
          v = n; break;
        }
        case 'color': v = okHex(v, d.d); break;
        case 'select': v = d.o.some(([k]) => k === v) ? v : d.d; break;
        case 'bool': v = !!v; break;
        case 'text': v = String(v ?? '').slice(0, 60); break;
        case 'image': v = typeof v === 'string' && v.startsWith('data:image/') ? v : ''; break;
        case 'stops': {
          const arr = (Array.isArray(v) ? v : []).filter((s) => s && typeof s === 'object').slice(0, 64)
            .map((s) => ({ at: clamp(Number(s.at) || 0), color: okHex(s.color, '#000000'), a: clamp(Number(s.a ?? 1)) }));
          v = arr.length ? arr : PL.clone(d.d); break;
        }
        case 'palette': {
          const cols = (v && Array.isArray(v.colors) ? v.colors : []).filter((c) => c && typeof c === 'object').slice(0, 24)
            .map((c) => ({ c: okHex(c.c, '#ffffff'), a: clamp(Number(c.a ?? 1)), w: clamp(Number(c.w) || 0, 0, 4) }));
          v = cols.length ? { colors: cols, blend: clamp(Number(v.blend ?? 1)), loop: !!v.loop } : PL.clone(d.d); break;
        }
      }
      p[d.k] = v;
    }
    return p;
  }
  const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? clamp(n, lo, hi) : d; };
  const FPS_OK = [10, 20, 25, 33, 50];
  // Clamp a whole document to what the editor can make. Returns { doc, dropped }.
  function sanitizeDoc(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const d = blankDoc();
    d.name = String(src.name ?? d.name).slice(0, 64);
    d.width = Math.round(num(src.width, 256, 8, 1024)); d.height = Math.round(num(src.height, 64, 8, 512));
    d.fps = FPS_OK.includes(Number(src.fps)) ? Number(src.fps) : 25;
    d.duration = Math.round(num(src.duration, 2, 0.4, 8) * 10) / 10;
    let dropped = 0;
    const custom = registerCustom(src.custom); // before the layer filter, which needs the definitions
    const L = Array.isArray(src.layers) ? src.layers : [], F = Array.isArray(src.effects) ? src.effects : [];
    d.layers = L.filter((l) => l && PL.LAYERS[l.type] || (dropped++, false)).slice(0, 60).map((l) => {
      const n = newLayer(l.type, l);
      n.name = String(n.name || '').slice(0, 64); n.visible = n.visible !== false; n.opacity = num(n.opacity, 1, 0, 1);
      if (!PL.BLENDS.some(([k]) => k === n.blend)) n.blend = 'normal';
      for (const k of ['scale', 'rotate', 'ox', 'oy', 'sx', 'sy', 'spin']) n.xf[k] = num(n.xf[k], DEFAULT_XF[k], k === 'scale' ? 0.1 : k === 'rotate' ? -180 : -8, k === 'scale' ? 6 : k === 'rotate' ? 180 : 8);
      for (const k of ['sx', 'sy', 'spin']) n.xf[k] = Math.round(n.xf[k]);
      n.tweak = sanitizeTweak(n.tweak);
      n.clip = !!l.clip; n.group = typeof l.group === 'string' ? l.group.slice(0, 40) : undefined; n.keys = sanitizeKeys(l.keys);
      return n;
    });
    d.effects = F.filter((e) => e && PL.EFFECTS[e.type] || (dropped++, false)).slice(0, 30).map((e) => {
      const n = newEffect(e.type, e); n.name = String(n.name || '').slice(0, 64); n.visible = n.visible !== false; n.keys = sanitizeKeys(e.keys); return n;
    });
    d.shadows = sanitizeShadows(src.shadows);
    d.groups = (Array.isArray(src.groups) ? src.groups : []).filter((g) => g && typeof g.id === 'string').slice(0, 30).map((g) => ({ id: g.id.slice(0, 40), name: String(g.name || 'Group').slice(0, 64), visible: g.visible !== false, collapsed: !!g.collapsed }));
    const gids = new Set(d.groups.map((g) => g.id)); for (const l of d.layers) if (l.group && !gids.has(l.group)) delete l.group;
    d.tweak = sanitizeTweak(src.tweak);
    // keep the code of the custom items this document uses, and nothing else
    const used = new Set([...d.layers.map((l) => l.type), ...d.effects.map((e) => e.type)]);
    for (const id of Object.keys(custom)) if (used.has(id)) d.custom[id] = custom[id];
    return { doc: d, dropped };
  }
  // keys: { path: [{ t, v, e }] }; paths are dotted and must start with params., xf. or be opacity
  function sanitizeKeys(keys) {
    if (!keys || typeof keys !== 'object') return undefined;
    const out = {};
    for (const [path, list] of Object.entries(keys).slice(0, 40)) {
      if (!/^(params\.[\w.]+|xf\.\w+|opacity)$/.test(path) || !Array.isArray(list)) continue;
      const ks = list.filter((k) => k && Number.isFinite(+k.t) && Number.isFinite(+k.v)).slice(0, 32).map((k) => ({ t: clamp(+k.t), v: +k.v, e: ['ease', 'linear', 'hold', 'in', 'out'].includes(k.e) ? k.e : 'ease' }));
      if (ks.length) out[path] = ks;
    }
    return Object.keys(out).length ? out : undefined;
  }
  function sanitizeTweak(tw) {
    const t = Object.assign({}, DEFAULT_TWEAK, tw && typeof tw === 'object' ? tw : {});
    return { hue: num(t.hue, 0, -180, 180), sat: num(t.sat, 1, 0, 2), bright: num(t.bright, 0, -0.5, 0.5), contrast: num(t.contrast, 1, 0.2, 2), tint: okHex(t.tint, '#ffffff'), tintAmt: num(t.tintAmt, 0, 0, 1) };
  }
  function sanitizeShadows(list) {
    return (Array.isArray(list) ? list : []).filter((s) => s && typeof s === 'object').slice(0, 8).map((s) => ({
      x_offset: num(s.x_offset, 0, -10, 10), y_offset: num(s.y_offset, 0, -10, 10), radius: num(s.radius, 0, 0, 20), color: Number.isFinite(Number(s.color)) ? Number(s.color) | 0 : 255,
    }));
  }

  // ---- custom code layers and effects (My library) ----
  // A document carries the code it uses: doc.custom = { custom_<id>: { kind: 'layer' | 'effect', name, code, labels: [a, b, c] } },
  // so a project renders anywhere it opens, the export worker included. Registering only builds the
  // function; nothing runs until a frame renders. The app asks before it opens someone else's code.
  //   layer:  body of function (u, v, t, p, o, c, H): write r, g, b, a (0..1) into o.
  //   effect: body of function (o, u, v, t, p, c, H): o holds the pixel's r, g, b, a; change it.
  // p has the palette (H.palette(f) writes its colour at f into o), p.speed (whole cycles per loop: use
  // H.TAU * t * p.speed so loops stay seamless) and three sliders p.a, p.b, p.c (0..1).
  // H.get(u, v) reads the image under the effect at any point (r, g, b, a).
  const CUSTOM_ID = /^custom_[A-Za-z0-9_]{1,48}$/;
  const customSeen = new Map(); // id -> code it was built from
  function cleanCustom(src) {
    const out = {};
    if (!src || typeof src !== 'object') return out;
    for (const [id, x] of Object.entries(src).slice(0, 40)) {
      if (!CUSTOM_ID.test(id) || !x || typeof x !== 'object' || typeof x.code !== 'string' || !['layer', 'effect'].includes(x.kind)) continue;
      const labels = (Array.isArray(x.labels) ? x.labels : []).slice(0, 3).map((l) => String(l ?? '').slice(0, 24));
      out[id] = { kind: x.kind, name: String(x.name || 'Custom').slice(0, 64), code: x.code.slice(0, 20000), labels };
    }
    return out;
  }
  function customParams(labels) {
    const P = PL.P, l = (i, d) => (labels && labels[i]) || d;
    return [P.pal('rainbowLoop', true), P.speed(1), P.range('a', l(0, 'Value A'), 0, 1, 0.01, 0.5), P.range('b', l(1, 'Value B'), 0, 1, 0.01, 0.5), P.range('c', l(2, 'Value C'), 0, 1, 0.01, 0.5)];
  }
  // Compiles the code. Returns { fn } or { error } (a syntax error, with the browser's message).
  function compileCustom(kind, code) {
    try { return { fn: kind === 'layer' ? new Function('u', 'v', 't', 'p', 'o', 'c', 'H', code) : new Function('o', 'u', 'v', 't', 'p', 'c', 'H', code) }; }
    catch (e) { return { error: e.message || String(e) }; }
  }
  function helpers() {
    return { TAU: Math.PI * 2, clamp, fract, mix: PL.mix, smoothstep: PL.smoothstep, tri: PL.tri, noise: PL.vnoise, fbm: PL.fbm, hash: PL.hash2, hsv: PL.hsvToRgb, luma: PL.luma };
  }
  const fin = (o) => { for (let k = 0; k < 4; k++) o[k] = Number.isFinite(o[k]) ? clamp(o[k]) : 0; };
  // Builds and registers the definitions; a definition that fails to compile draws nothing and keeps its error.
  function registerCustom(src) {
    const list = cleanCustom(src);
    for (const [id, x] of Object.entries(list)) {
      const key = x.kind + '\n' + x.labels.join('\n') + '\n' + x.code;
      if (customSeen.get(id) === key && (x.kind === 'layer' ? PL.LAYERS[id] : PL.EFFECTS[id])) continue;
      customSeen.set(id, key);
      const built = compileCustom(x.kind, x.code), fn = built.fn, H = helpers();
      const def = { id, name: x.name, cat: 'My library', desc: 'Your own code.', tags: ['custom', 'code', 'my library'], custom: true, error: built.error || null, params: customParams(x.labels) };
      let failed = false;
      const fail = (e) => { if (!failed) { failed = true; def.error = 'Runs with an error: ' + (e.message || String(e)); } };
      if (x.kind === 'layer') {
        let cur = null, curP = null;
        H.palette = (f) => PL.lutAt(curP._stops, fract(f), cur);
        def.sample = (u, v, t, p, o, c) => {
          o[0] = o[1] = o[2] = 0; o[3] = 1;
          if (!fn || failed) { o[3] = 0; return o; }
          cur = o; curP = p;
          try { fn(u, v, t, p, o, c, H); } catch (e) { fail(e); o[3] = 0; }
          fin(o); return o;
        };
        PL.LAYERS[id] = def;
      } else {
        def.run = (buf, W, Hh, t, p, c) => {
          if (!fn || failed) return buf;
          const out = new Float32Array(buf.length), o = [0, 0, 0, 0], g = [0, 0, 0, 0];
          let cur = o;
          H.palette = (f) => PL.lutAt(p._stops, fract(f), cur);
          H.get = (u, v) => PL.fx.bilinear(buf, W, Hh, u * W, v * Hh, g, false);
          for (let y = 0, i = 0; y < Hh; y++) for (let x = 0; x < W; x++, i += 4) {
            o[0] = buf[i]; o[1] = buf[i + 1]; o[2] = buf[i + 2]; o[3] = buf[i + 3]; cur = o;
            try { fn(o, (x + 0.5) / W, (y + 0.5) / Hh, t, p, c, H); } catch (e) { fail(e); return buf; }
            fin(o); out[i] = o[0]; out[i + 1] = o[1]; out[i + 2] = o[2]; out[i + 3] = o[3];
          }
          return out;
        };
        PL.EFFECTS[id] = def;
      }
    }
    return list;
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
    return { name: 'Unnamed Paint', width: 256, height: 64, fps: 25, duration: 2, layers: [], effects: [], shadows: [], tweak: Object.assign({}, DEFAULT_TWEAK), groups: [], custom: {} };
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
    const m = PL.fx.hueMatrix(tw.hue);
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

  // ---- keyframes ----
  // item.keys = { 'params.size': [{ t: 0..1, v: number, e: 'ease' | 'linear' | 'hold' }], 'xf.rotate': [...], 'opacity': [...] }
  // Values interpolate between keys and wrap from the last key back to the first across the loop
  // end, so a keyed loop stays seamless. Paths can reach into palettes: 'params.stops.colors.2.w'.
  const EASE = { linear: (k) => k, ease: (k) => k * k * (3 - 2 * k), hold: () => 0, in: (k) => k * k, out: (k) => 1 - (1 - k) * (1 - k) };
  function keyValue(keys, t) {
    const ks = keys.filter((k) => Number.isFinite(k.t) && Number.isFinite(k.v)).sort((a, b) => a.t - b.t);
    if (!ks.length) return null;
    if (ks.length === 1) return ks[0].v;
    let a = ks[ks.length - 1], b = ks[0], span, k;
    for (let i = 0; i < ks.length - 1; i++) if (t >= ks[i].t && t < ks[i + 1].t) { a = ks[i]; b = ks[i + 1]; break; }
    if (a === ks[ks.length - 1]) { span = 1 - a.t + b.t; k = span > 0 ? ((t >= a.t ? t - a.t : t + 1 - a.t) / span) : 0; }
    else { span = b.t - a.t; k = span > 0 ? (t - a.t) / span : 0; }
    return a.v + (b.v - a.v) * (EASE[a.e] || EASE.ease)(clamp(k));
  }
  function setPath(obj, path, v) {
    const parts = path.split('.'); let o = obj;
    for (let i = 0; i < parts.length - 1; i++) { if (o == null) return; o = o[parts[i]]; }
    if (o != null && typeof o[parts[parts.length - 1]] === 'number') o[parts[parts.length - 1]] = v;
  }
  const hasKeys = (it) => it.keys && Object.values(it.keys).some((k) => Array.isArray(k) && k.length);
  // The item with every keyed value applied for moment t (a copy; the document is untouched).
  function itemAt(it, t) {
    const c = { params: PL.clone(it.params), xf: Object.assign({}, it.xf), opacity: it.opacity };
    for (const [path, keys] of Object.entries(it.keys || {})) { const v = keyValue(keys, t); if (v != null) setPath(c, path, v); }
    return c;
  }

  function compileLayer(l, at) {
    const def = PL.LAYERS[l.type], src = at || l;
    return { def, p: prepParams(def, src.params), xf: Object.assign({}, DEFAULT_XF, src.xf), blend: l.blend, opacity: clamp(src.opacity), tweak: compileTweak(l.tweak), clip: !!l.clip, keyed: hasKeys(l) ? l : null };
  }
  function compileEffect(e, at) {
    const def = PL.EFFECTS[e.type];
    return { def, p: prepParams(def, (at || e).params), keyed: hasKeys(e) ? e : null };
  }
  function compile(doc) {
    if (doc.custom) registerCustom(doc.custom); // e.g. in the export worker, which gets the document as it is
    // groups are folders in the layer list; a hidden group hides its layers
    const hiddenGroups = new Set((doc.groups || []).filter((g) => g.visible === false).map((g) => g.id));
    return {
      W: doc.width | 0, H: doc.height | 0, frames: frameCount(doc),
      layers: doc.layers.filter((l) => l.visible && PL.LAYERS[l.type] && !hiddenGroups.has(l.group)).map((l) => compileLayer(l)),
      effects: doc.effects.filter((e) => e.visible && PL.EFFECTS[e.type]).map((e) => compileEffect(e)),
      tweak: compileTweak(doc.tweak),
    };
  }

  // Scratch canvas for layers that draw with the 2D canvas API (scene elements).
  let scratch = null, sctx = null;
  function scratchFor(W, H) {
    if (!scratch) { scratch = PL.makeCanvas(W, H); sctx = scratch.getContext('2d', { willReadFrequently: true }); }
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
    // coverage of the last unclipped layer, for "clip to layer below" (a clipped layer only shows where it does)
    const needCov = cp.layers.some((l) => l.clip);
    const cov = needCov ? new Float32Array(W * H) : null;
    for (let L of cp.layers) {
      if (L.keyed) L = Object.assign({}, compileLayer(L.keyed, itemAt(L.keyed, t)));
      const { def, p, xf, tweak } = L;
      const clip = L.clip && cov, track = cov && !L.clip;
      if (def.draw) {
        const d = drawLayer(L, t, c);
        for (let i = 0, q = 0; i < d.length; i += 4, q++) {
          let a = d[i + 3] / 255;
          if (track) cov[q] = a;
          if (clip) a *= cov[q];
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
          let a = clamp(o[3]);
          if (track) cov[i >> 2] = a;
          if (clip) a *= cov[i >> 2];
          PL.blendPx(buf, i, o, a * L.opacity, L.blend);
        }
      }
    }
    let out = buf;
    for (let E of cp.effects) { if (E.keyed) E = compileEffect(E.keyed, itemAt(E.keyed, t)); out = E.def.run(out, W, H, t, E.p, c) || out; }
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

  PL.Engine = { registerCustom, cleanCustom, compileCustom, CUSTOM_ID, keyValue, itemAt, hasKeys, newLayer, newEffect, blankDoc, frameCount, compile, renderBuf, renderFrame, toImageData, defaults, fixParams, sanitizeDoc, sanitizeShadows, DEFAULT_XF, DEFAULT_TWEAK };
})(window.PL);
