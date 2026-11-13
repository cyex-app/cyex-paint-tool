/* Static 7TV paints: the v3 JSON model, the CSS the 7TV extension builds from it, and a
   pixel-exact rasteriser so a paint can be exported as PNG. */
(function (PL) {
  'use strict';
  const { clamp, decToCss, unpackRGBA, normStops, sampleStops } = PL;

  const FUNCS = ['LINEAR_GRADIENT', 'RADIAL_GRADIENT', 'URL'];

  function blankPaint() {
    return { name: 'Unnamed Paint', function: 'LINEAR_GRADIENT', repeat: false, angle: 90, shape: 'circle', image_url: '', stops: [], shadows: [] };
  }

  // Accepts the editor's own export, a 7TV API object ({ data: {...} } or v2 fields) or a
  // loose hand-written variant (hex strings for colours, "at" in percent).
  function normalize(input) {
    let p = input;
    if (typeof p === 'string') p = JSON.parse(p);
    if (p && p.data && typeof p.data === 'object' && !p.stops) p = Object.assign({ name: p.name }, p.data);
    if (!p || typeof p !== 'object') throw new Error('Not a paint object');
    const out = blankPaint();
    out.name = String(p.name ?? out.name);
    const fn = String(p.function || 'LINEAR_GRADIENT').toUpperCase().replace('-', '_');
    out.function = FUNCS.includes(fn) ? fn : fn.includes('RADIAL') ? 'RADIAL_GRADIENT' : fn === 'IMAGE' ? 'URL' : 'LINEAR_GRADIENT';
    out.repeat = !!p.repeat;
    out.angle = Number.isFinite(+p.angle) ? +p.angle : 90;
    out.shape = p.shape === 'ellipse' ? 'ellipse' : 'circle';
    out.image_url = String(p.image_url || '');
    const toInt = (c) => {
      if (typeof c === 'number') return c | 0;
      if (typeof c === 'string') {
        const m = c.trim();
        if (/^-?\d+$/.test(m)) return parseInt(m, 10) | 0;
        const h = m.replace('#', '');
        const [r, g, b] = PL.hexToRgb(h.slice(0, 6));
        const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) : 255;
        return PL.packRGBA(r, g, b, a);
      }
      return 255;
    };
    const stops = Array.isArray(p.stops) ? p.stops : [];
    const anyOver1 = stops.some((s) => +s.at > 1);
    out.stops = stops.map((s) => ({ at: round4(clamp((+s.at || 0) / (anyOver1 ? 100 : 1))), color: toInt(s.color) }));
    out.shadows = (Array.isArray(p.shadows) ? p.shadows : []).map((s) => ({
      x_offset: +s.x_offset || 0, y_offset: +s.y_offset || 0, radius: Math.max(0, +s.radius || 0), color: toInt(s.color),
    }));
    return out;
  }
  const round4 = (x) => Math.round(x * 10000) / 10000;

  // Mirrors createGradientFromPaint in SevenTV/Extension (src/composable/useCosmetics.ts).
  function gradientCss(p) {
    const args = [];
    if (p.function === 'LINEAR_GRADIENT') args.push(`${p.angle ?? 0}deg`);
    else if (p.function === 'RADIAL_GRADIENT') args.push(p.shape ?? 'circle');
    else args.push(p.image_url ?? '');
    let prefix = '';
    if (p.function !== 'URL') {
      prefix = p.repeat ? 'repeating-' : '';
      for (const s of p.stops) args.push(`${decToCss(s.color)} ${s.at * 100}%`);
    }
    return `${prefix}${p.function.toLowerCase().replace('_', '-')}(${args.join(', ')})`;
  }
  const shadowCss = (s) => `drop-shadow(${s.x_offset}px ${s.y_offset}px ${s.radius}px ${decToCss(s.color)})`;
  function filterCss(p) { return p.shadows && p.shadows.length ? p.shadows.map(shadowCss).join(' ') : ''; }

  // Inline style for a preview element (the extension also sets background-color: currentcolor,
  // background-clip: text and a transparent text fill on the painted name).
  function styleFor(p) {
    return {
      backgroundImage: gradientCss(p),
      backgroundSize: p.function === 'URL' ? '100% 100%' : '',
      filter: filterCss(p) || '',
    };
  }
  function cssText(p) {
    const lines = [
      '.seventv-paint {',
      '  background-color: currentcolor;',
      `  background-image: ${gradientCss(p)};`,
    ];
    if (p.function === 'URL') lines.push('  background-size: 100% 100%;');
    lines.push('  background-clip: text;', '  -webkit-background-clip: text;', '  -webkit-text-fill-color: transparent;', '  font-weight: 700;');
    const f = filterCss(p);
    if (f) lines.push(`  filter: ${f};`);
    lines.push('}');
    return lines.join('\n');
  }
  function toJson(p) {
    return JSON.stringify({
      name: p.name, function: p.function, repeat: p.repeat, angle: p.angle, shape: p.shape, image_url: p.image_url,
      stops: p.stops.map((s) => ({ at: s.at, color: s.color })),
      shadows: p.shadows.map((s) => ({ x_offset: s.x_offset, y_offset: s.y_offset, radius: s.radius, color: s.color })),
    }, null, 2);
  }

  // Editor-friendly stops for the shared sampler.
  function editorStops(p) {
    return p.stops.map((s) => { const [r, g, b, a] = unpackRGBA(s.color); return { at: s.at, color: PL.rgbToHex(r, g, b), a: a / 255 }; });
  }

  // Rasterise a gradient paint to ImageData with the same geometry CSS uses for an element of w x h.
  function rasterize(p, w, h) {
    const img = new ImageData(w, h), d = img.data, o = [0, 0, 0, 0];
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

  PL.Paint = { blankPaint, normalize, gradientCss, filterCss, styleFor, cssText, toJson, editorStops, rasterize, shadowCss };
})(window.PL);
