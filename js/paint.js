/* Static 7TV paints: the v3 JSON model, the CSS the 7TV extension builds from it, and a
   pixel-exact rasteriser so a paint can be exported as PNG.
   Two shapes: "classic" (one gradient in the top-level fields, the old 7TV v2 format) and
   "layered" (paint.data.gradients[] plus paint.data.text, as read by SevenTV/Extension
   src/composable/useCosmetics.ts and typed in src/types/app.d.ts). */
(function (PL) {
  'use strict';
  const { clamp, decToCss, unpackRGBA, normStops, sampleStops } = PL;

  const FUNCS = ['LINEAR_GRADIENT', 'RADIAL_GRADIENT', 'URL'];                      // classic editor
  const GFUNCS = ['LINEAR_GRADIENT', 'RADIAL_GRADIENT', 'CONIC_GRADIENT', 'URL'];   // CosmeticPaintGradientFunction
  const REPEATS = ['no-repeat', 'repeat', 'repeat-x', 'repeat-y', 'round', 'space']; // the modes the extension's paint tool offers
  const MAX_LAYERS = 10;
  const MAX_SHADOWS = 8;

  function blankText() { return { weight: 0, stroke: null, shadows: [], transform: '' }; }
  function blankGradient(over) {
    return Object.assign({ function: 'LINEAR_GRADIENT', canvas_repeat: 'no-repeat', size: [1, 1], at: [0, 0], repeat: false, stops: [], angle: 90, shape: 'circle', image_url: '' }, over || {});
  }
  function blankPaint() {
    return { name: 'Unnamed Paint', function: 'LINEAR_GRADIENT', repeat: false, angle: 90, shape: 'circle', image_url: '', stops: [], shadows: [], layered: false, gradients: [], text: blankText(), color: null };
  }
  // Presets and old saves lack the layered fields; this adds them in place.
  function ensure(p) {
    if (!Array.isArray(p.gradients)) p.gradients = [];
    if (!p.text || typeof p.text !== 'object') p.text = blankText();
    if (!Array.isArray(p.text.shadows)) p.text.shadows = [];
    if (p.text.stroke === undefined) p.text.stroke = null;
    if (p.text.transform == null) p.text.transform = '';
    if (!Number.isFinite(p.text.weight)) p.text.weight = 0;
    if (p.color === undefined) p.color = null;
    p.layered = !!p.layered;
    return p;
  }
  const copyStops = (stops) => (stops || []).map((s) => ({ at: s.at, color: s.color }));
  // The classic fields as one layer (what the extension builds for a v2 paint: size 100% x 100%).
  function classicLayer(p) {
    return blankGradient({ function: p.function, repeat: !!p.repeat, angle: p.angle, shape: p.shape, image_url: p.image_url || '', stops: copyStops(p.stops) });
  }
  const textHas = (t) => !!t && (t.weight > 0 || !!t.stroke || (t.shadows && t.shadows.length > 0) || !!t.transform);
  // A layer that fills the whole name: nothing the classic format can't say.
  function isPlain(g) {
    if (!g || g.function === 'CONIC_GRADIENT') return false;
    return g.size ? g.size[0] === 1 && g.size[1] === 1 : g.function !== 'URL';
  }
  // Layered mode only counts as layered JSON when it needs to.
  function needsLayers(p) {
    if (!p.layered) return false;
    const g = p.gradients || [];
    return g.length !== 1 || !isPlain(g[0]) || textHas(p.text);
  }
  function toLayered(p) {
    ensure(p);
    if (!p.gradients.length) p.gradients = [classicLayer(p)];
    p.layered = true;
    return p;
  }
  // Back to one gradient: the first layer becomes the classic fields, the rest and the text style are dropped.
  function toClassic(p) {
    ensure(p);
    const g = p.gradients[0];
    if (g) {
      p.function = g.function === 'CONIC_GRADIENT' ? 'LINEAR_GRADIENT' : g.function;
      p.repeat = !!g.repeat; p.angle = g.angle ?? 90; p.shape = g.shape === 'ellipse' ? 'ellipse' : 'circle'; p.image_url = g.image_url || '';
      p.stops = copyStops(g.stops);
    }
    p.layered = false; p.gradients = []; p.text = blankText();
    return p;
  }

  // Accepts the editor's own export, a 7TV API object ({ data: {...} } with gradients[] or v2 fields) or a
  // loose hand-written variant (hex strings for colours, "at" in percent).
  // withWarnings: return { paint, warnings } so the import can say what it corrected.
  function normalize(input, withWarnings) {
    const warnings = [];
    let p = input;
    if (typeof p === 'string') p = JSON.parse(p);
    if (p && p.data && typeof p.data === 'object' && !p.stops && !p.gradients) p = Object.assign({ name: p.name }, p.data);
    if (!p || typeof p !== 'object') throw new Error('Not a paint object');
    const out = blankPaint();
    out.name = String(p.name ?? out.name).slice(0, 64);
    let badColours = 0;
    const toInt = (c) => {
      if (typeof c === 'number' && Number.isFinite(c)) return c | 0;
      if (typeof c === 'string') {
        const m = c.trim();
        if (/^-?\d+$/.test(m)) return parseInt(m, 10) | 0;
        const h = m.replace('#', '');
        if (/^([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(h)) {
          const full = h.length <= 4 ? h.split('').map((x) => x + x).join('') : h;
          const [r, g, b] = PL.hexToRgb(full.slice(0, 6));
          const a = full.length === 8 ? parseInt(full.slice(6, 8), 16) : 255;
          return PL.packRGBA(r, g, b, a);
        }
      }
      badColours++;
      return 255;
    };
    const objs = (v, max) => (Array.isArray(v) ? v : []).filter((s) => s && typeof s === 'object').slice(0, max);
    const normShadows = (v) => objs(v, MAX_SHADOWS).map((s) => ({
      x_offset: clamp(+s.x_offset || 0, -10, 10), y_offset: clamp(+s.y_offset || 0, -10, 10), radius: clamp(+s.radius || 0, 0, 20), color: toInt(s.color),
    }));
    const pair = (v, lo, hi) => (Array.isArray(v) && v.length === 2 ? [round4(clamp(+v[0] || 0, lo, hi)), round4(clamp(+v[1] || 0, lo, hi))] : null);

    // One gradient, from a layer object or from the classic top-level fields (`g` is then the paint itself).
    const normGradient = (g) => {
      const o = blankGradient({ canvas_repeat: '', size: null, at: [0, 0] });
      const fn = String(g.function || 'LINEAR_GRADIENT').toUpperCase().replace('-', '_');
      o.function = GFUNCS.includes(fn) ? fn : fn.includes('RADIAL') ? 'RADIAL_GRADIENT' : fn.includes('CONIC') ? 'CONIC_GRADIENT' : fn === 'IMAGE' ? 'URL' : 'LINEAR_GRADIENT';
      o.repeat = !!g.repeat;
      const ang = Number.isFinite(+g.angle) ? +g.angle : 90;
      o.angle = ((ang % 360) + 360) % 360;
      if (o.angle !== ang) warnings.push(`The angle ${PL.fmtNum(ang, ang % 1 ? 1 : 0)}° was outside 0–360° and became ${PL.fmtNum(o.angle, o.angle % 1 ? 1 : 0)}°.`);
      o.shape = g.shape === 'ellipse' ? 'ellipse' : 'circle';
      o.image_url = safeUrl(g.image_url);
      if (g.image_url && !o.image_url) warnings.push('The image URL was dropped; only http and https links work.');
      o.canvas_repeat = REPEATS.includes(g.canvas_repeat) ? g.canvas_repeat : '';
      o.size = pair(g.size, 0, 50);
      o.at = pair(g.at, -10, 10) || [0, 0];
      const stops = objs(g.stops, 64);
      const anyOver1 = stops.some((s) => +s.at > 1);
      o.stops = stops.map((s) => ({ at: round4(clamp((+s.at || 0) / (anyOver1 ? 100 : 1))), color: toInt(s.color) }));
      return o;
    };

    let gl = objs(p.gradients, MAX_LAYERS).map(normGradient);
    if (Array.isArray(p.gradients) && p.gradients.length > MAX_LAYERS) warnings.push(`Only the first ${MAX_LAYERS} gradient layers were kept.`);
    if (!gl.length) { const g0 = normGradient(p); g0.size = [1, 1]; g0.canvas_repeat = ''; gl = [g0]; } // the extension's v2 conversion

    const t = p.text && typeof p.text === 'object' ? p.text : {};
    const text = blankText();
    let w = Number.isFinite(+t.weight) ? +t.weight : 0;
    if (w > 9) w /= 100; // tolerate 700 for 7
    text.weight = clamp(Math.round(w), 0, 9);
    if (t.stroke && typeof t.stroke === 'object') text.stroke = { color: t.stroke.color == null ? 255 : toInt(t.stroke.color), width: round4(clamp(+t.stroke.width || 0, 0, 20)) };
    text.shadows = normShadows(t.shadows);
    text.transform = t.transform === 'uppercase' || t.transform === 'lowercase' ? t.transform : '';
    if (Array.isArray(p.flairs) && p.flairs.length) warnings.push('Flairs aren’t supported and were dropped.');

    out.color = p.color == null ? null : toInt(p.color);
    out.shadows = normShadows(p.shadows);
    out.layered = p.layered === true || gl.length > 1 || !isPlain(gl[0]) || textHas(text);

    // classic fields always mirror the first layer, so switching back is lossless for a single gradient
    const g0 = gl[0];
    out.function = g0.function === 'CONIC_GRADIENT' ? 'LINEAR_GRADIENT' : g0.function;
    out.repeat = g0.repeat; out.angle = g0.angle; out.shape = g0.shape; out.image_url = g0.image_url; out.stops = g0.stops;
    if (out.layered) { out.gradients = gl; out.text = text; }
    if (badColours) warnings.push(badColours > 1 ? `${badColours} colours weren’t valid and became black.` : 'One colour wasn’t valid and became black.');
    return withWarnings ? { paint: out, warnings } : out;
  }
  // Only http(s) links go into CSS; anything else (javascript:, data:, broken strings) is dropped.
  function safeUrl(u) {
    if (!u) return '';
    try { const x = new URL(String(u).trim()); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : ''; } catch (e) { return ''; }
  }
  const cssUrl = (u) => `url("${String(u).replace(/["\\\n\r]/g, (c) => encodeURIComponent(c))}")`;
  const round4 = (x) => Math.round(x * 10000) / 10000;

  // Mirrors createGradientFromPaint in SevenTV/Extension (src/composable/useCosmetics.ts).
  // Works on a classic paint and on one entry of gradients[]. The extension adds no argument for
  // CONIC_GRADIENT, so a conic layer starts at the top and runs clockwise.
  function gradientCss(p) {
    const args = [];
    if (p.function === 'LINEAR_GRADIENT') args.push(`${p.angle ?? 0}deg`);
    else if (p.function === 'RADIAL_GRADIENT') args.push(p.shape ?? 'circle');
    else if (p.function === 'URL') { const u = safeUrl(p.image_url); return u ? cssUrl(u) : 'none'; }
    const prefix = p.repeat ? 'repeating-' : '';
    for (const s of p.stops) args.push(`${decToCss(s.color)} ${s.at * 100}%`);
    return `${prefix}${p.function.toLowerCase().replace('_', '-')}(${args.join(', ')})`;
  }
  const shadowCss = (s) => `drop-shadow(${s.x_offset}px ${s.y_offset}px ${s.radius}px ${decToCss(s.color)})`;
  function filterCss(p) { return p.shadows && p.shadows.length ? p.shadows.map(shadowCss).join(' ') : ''; }

  // ---- layered CSS (extension: background-image / -position / -size / -repeat, one entry per layer) ----
  // The extension joins raw values and leaves "" for unset ones, which browsers drop; here every list
  // entry is a valid value (position 0% 0%, size auto, repeat repeat).
  const pct = (v) => round4(v * 100) + '%';
  const layerPosition = (g) => { const a = g.at && g.at.length === 2 ? g.at : [0, 0]; return `${pct(a[0])} ${pct(a[1])}`; };
  const layerSize = (g) => (g.size && g.size.length === 2 ? `${pct(g.size[0])} ${pct(g.size[1])}` : 'auto');
  const layerRepeat = (g) => (REPEATS.includes(g.canvas_repeat) ? g.canvas_repeat : 'repeat');
  function layersCss(p) {
    const gs = p.gradients && p.gradients.length ? p.gradients : [classicLayer(p)];
    return { image: gs.map(gradientCss).join(', '), position: gs.map(layerPosition).join(', '), size: gs.map(layerSize).join(', '), repeat: gs.map(layerRepeat).join(', ') };
  }
  const textShadowCss = (s) => `${s.x_offset}px ${s.y_offset}px ${s.radius}px ${decToCss(s.color)}`;
  // Declarations from paint.data.text; '' means "leave the default".
  function textCss(p) {
    const t = p.layered && p.text ? p.text : null;
    return {
      fontWeight: t && t.weight > 0 ? String(t.weight * 100) : '',
      strokeWidth: t && t.stroke ? `${t.stroke.width}px` : '',
      strokeColor: t && t.stroke ? decToCss(t.stroke.color) : '',
      textShadow: t && t.shadows.length ? t.shadows.map(textShadowCss).join(', ') : '',
      textTransform: t && t.transform ? t.transform : '',
    };
  }

  // Inline style for a preview element (the extension also sets background-color: currentcolor,
  // background-clip: text and a transparent text fill on the painted name). Empty strings reset a property.
  function styleFor(p) {
    const tx = textCss(p);
    if (p.layered) {
      const l = layersCss(p);
      return Object.assign({ backgroundImage: l.image, backgroundPosition: l.position, backgroundSize: l.size, backgroundRepeat: l.repeat, filter: filterCss(p) || '' }, tx);
    }
    return Object.assign({
      backgroundImage: gradientCss(p),
      backgroundPosition: '',
      backgroundSize: p.function === 'URL' ? '100% 100%' : '',
      backgroundRepeat: '',
      filter: filterCss(p) || '',
    }, tx);
  }
  function cssText(p) {
    const lines = ['.seventv-paint {', '  background-color: currentcolor;'];
    if (p.layered) {
      const l = layersCss(p), tx = textCss(p);
      lines.push(`  background-image: ${l.image};`, `  background-position: ${l.position};`, `  background-size: ${l.size};`, `  background-repeat: ${l.repeat};`);
      lines.push('  background-clip: text;', '  -webkit-background-clip: text;', '  -webkit-text-fill-color: transparent;');
      lines.push(`  font-weight: ${tx.fontWeight || 700};`);
      if (tx.strokeWidth) lines.push(`  -webkit-text-stroke-width: ${tx.strokeWidth};`, `  -webkit-text-stroke-color: ${tx.strokeColor};`);
      if (tx.textShadow) lines.push(`  text-shadow: ${tx.textShadow};`);
      if (tx.textTransform) lines.push(`  text-transform: ${tx.textTransform};`);
      const f = filterCss(p);
      if (f) lines.push(`  filter: ${f};`);
      lines.push('}');
      return lines.join('\n');
    }
    lines.push(`  background-image: ${gradientCss(p)};`);
    if (p.function === 'URL') lines.push('  background-size: 100% 100%;');
    lines.push('  background-clip: text;', '  -webkit-background-clip: text;', '  -webkit-text-fill-color: transparent;', '  font-weight: 700;');
    const f = filterCss(p);
    if (f) lines.push(`  filter: ${f};`);
    lines.push('}');
    return lines.join('\n');
  }

  const shadowJson = (s) => ({ x_offset: s.x_offset, y_offset: s.y_offset, radius: s.radius, color: s.color });
  function gradientJson(g) {
    const o = { function: g.function, canvas_repeat: g.canvas_repeat || '', size: g.size ? [g.size[0], g.size[1]] : null, at: g.at ? [g.at[0], g.at[1]] : [0, 0] };
    o.stops = g.function === 'URL' ? [] : copyStops(g.stops);
    if (g.function === 'LINEAR_GRADIENT') o.angle = g.angle;
    else if (g.function === 'RADIAL_GRADIENT') o.shape = g.shape;
    else if (g.function === 'URL') o.image_url = g.image_url;
    o.repeat = g.function === 'URL' ? false : !!g.repeat;
    return o;
  }
  // Classic JSON when the paint is one plain gradient with no text style; the layered format otherwise.
  function toJson(p) {
    if (!needsLayers(p)) {
      const c = p.layered && p.gradients[0] ? Object.assign({ shadows: p.shadows }, p.gradients[0]) : p; // layered mode, but only one plain layer
      const o = { name: p.name, function: c.function, repeat: !!c.repeat, angle: c.angle, shape: c.shape, image_url: c.image_url, stops: copyStops(c.stops), shadows: p.shadows.map(shadowJson) };
      if (p.color != null) o.color = p.color;
      return JSON.stringify(o, null, 2);
    }
    const o = { name: p.name, color: p.color == null ? null : p.color, gradients: p.gradients.map(gradientJson), shadows: p.shadows.map(shadowJson) };
    const t = p.text;
    if (textHas(t)) {
      o.text = {};
      if (t.weight > 0) o.text.weight = t.weight;
      if (t.stroke) o.text.stroke = { color: t.stroke.color, width: t.stroke.width };
      if (t.shadows.length) o.text.shadows = t.shadows.map(shadowJson);
      if (t.transform) o.text.transform = t.transform;
    }
    return JSON.stringify(o, null, 2);
  }

  // Editor-friendly stops for the shared sampler (and the stops editor). Works on a paint or a layer.
  function editorStops(p) {
    return p.stops.map((s) => { const [r, g, b, a] = unpackRGBA(s.color); return { at: s.at, color: PL.rgbToHex(r, g, b), a: a / 255 }; });
  }

  // Rasterise one gradient (a classic paint or a layer) to ImageData with the geometry CSS uses for a box of w x h.
  function rasterizeGradient(p, w, h) {
    const img = new ImageData(w, h), d = img.data, o = [0, 0, 0, 0];
    if (!p.stops || !p.stops.length) return img;
    const s = normStops(editorStops(p));
    const first = s[0].at, period = s[s.length - 1].at - first;
    const rep = p.repeat && period > 1e-6;
    let tAt;
    if (p.function === 'RADIAL_GRADIENT') {
      const cx = w / 2, cy = h / 2;
      if (p.shape === 'ellipse') {
        const rx = cx * Math.SQRT2, ry = cy * Math.SQRT2;
        tAt = (x, y) => Math.hypot((x - cx) / rx, (y - cy) / ry);
      } else {
        const R = Math.hypot(cx, cy);
        tAt = (x, y) => Math.hypot(x - cx, y - cy) / R;
      }
    } else if (p.function === 'CONIC_GRADIENT') {
      const cx = w / 2, cy = h / 2;
      tAt = (x, y) => { const t = Math.atan2(x - cx, -(y - cy)) / (2 * Math.PI); return t < 0 ? t + 1 : t; };
    } else {
      const a = ((p.angle || 0) * Math.PI) / 180, dx = Math.sin(a), dy = -Math.cos(a);
      const L = Math.abs(w * dx) + Math.abs(h * dy) || 1;
      tAt = (x, y) => ((x - w / 2) * dx + (y - h / 2) * dy) / L + 0.5;
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let t = tAt(x + 0.5, y + 0.5);
        if (rep) t = first + (((t - first) % period) + period) % period;
        sampleStops(s, t, o);
        const i = (y * w + x) * 4;
        d[i] = o[0] * 255; d[i + 1] = o[1] * 255; d[i + 2] = o[2] * 255; d[i + 3] = o[3] * 255;
      }
    }
    return img;
  }

  // Draw one layer into ctx (a w x h box) the way CSS lays out a background layer:
  // background-size (fractions of the box; "auto" is the box for gradients and the picture's own size for images),
  // background-position (the at fraction aligns that point of the tile with the same point of the box) and
  // background-repeat (no-repeat, repeat, repeat-x, repeat-y, round, space).
  function drawLayer(ctx, g, w, h, img) {
    let sw, sh, src, srcW, srcH;
    if (g.function === 'URL') {
      if (!img) return;
      srcW = img.naturalWidth || img.width; srcH = img.naturalHeight || img.height;
      if (!srcW || !srcH) return;
      src = img;
      sw = g.size ? g.size[0] * w : srcW; sh = g.size ? g.size[1] * h : srcH;
    } else {
      sw = g.size ? g.size[0] * w : w; sh = g.size ? g.size[1] * h : h;
    }
    if (!(sw >= 0.5 && sh >= 0.5)) return;
    if (!src) {
      srcW = Math.min(4096, Math.max(1, Math.round(sw))); srcH = Math.min(4096, Math.max(1, Math.round(sh)));
      src = document.createElement('canvas'); src.width = srcW; src.height = srcH;
      src.getContext('2d').putImageData(rasterizeGradient(g, srcW, srcH), 0, 0);
    }
    const rep = layerRepeat(g), at = g.at && g.at.length === 2 ? g.at : [0, 0];
    if (rep === 'round') { sw = w / Math.max(1, Math.round(w / sw)); sh = h / Math.max(1, Math.round(h / sh)); }
    const ox = rep === 'round' ? 0 : (w - sw) * at[0], oy = rep === 'round' ? 0 : (h - sh) * at[1];
    ctx.save();
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    if (rep === 'no-repeat') ctx.drawImage(src, ox, oy, sw, sh);
    else if (rep === 'space') {
      const nx = Math.floor(w / sw), ny = Math.floor(h / sh);
      if (nx >= 1 && ny >= 1 && nx * ny <= 20000) {
        const gx = nx > 1 ? (w - nx * sw) / (nx - 1) : 0, gy = ny > 1 ? (h - ny * sh) / (ny - 1) : 0;
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) ctx.drawImage(src, i * (sw + gx), j * (sh + gy), sw, sh);
      }
    } else {
      const pat = ctx.createPattern(src, 'repeat');
      pat.setTransform(new DOMMatrix([sw / srcW, 0, 0, sh / srcH, ox, oy]));
      ctx.fillStyle = pat;
      const rx = rep === 'repeat-y' ? ox : 0, rw = rep === 'repeat-y' ? sw : w, ry = rep === 'repeat-x' ? oy : 0, rh = rep === 'repeat-x' ? sh : h;
      ctx.fillRect(rx, ry, rw, rh);
    }
    ctx.restore();
  }
  // Stack the layers like CSS does: the first layer is on top. images[i] is the loaded picture of layer i (URL layers).
  function composeLayers(p, w, h, images) {
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    const gs = p.layered && p.gradients.length ? p.gradients : [classicLayer(p)];
    for (let i = gs.length - 1; i >= 0; i--) drawLayer(ctx, gs[i], w, h, images && images[i]);
    return cv;
  }

  // Rasterise a paint to ImageData. Layered paints compose every layer; images are the loaded pictures of URL layers.
  function rasterize(p, w, h, images) {
    if (p.layered) return composeLayers(p, w, h, images).getContext('2d').getImageData(0, 0, w, h);
    return rasterizeGradient(p, w, h);
  }

  PL.Paint = {
    safeUrl, blankPaint, blankGradient, blankText, ensure, normalize, gradientCss, filterCss, styleFor, cssText, toJson, editorStops,
    rasterize, rasterizeGradient, composeLayers, shadowCss, layersCss, textCss, textHas, isPlain, needsLayers, classicLayer, toLayered, toClassic,
    GFUNCS, REPEATS, MAX_LAYERS,
  };
})(window.PL);
