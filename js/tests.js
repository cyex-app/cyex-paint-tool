/* cyex paints self-test. Open cyex-paints-tests.html (or tests.html); everything runs locally.
   Render fingerprints are compared with js/tests-baseline.js; after an intentional visual change,
   press "Copy new baseline" and paste it into that file. */
(function (PL) {
  'use strict';
  const E = PL.Engine;
  const results = [];
  const out = document.getElementById('results');
  const summary = document.getElementById('summary');

  const hash = (d) => { let h = 2166136261; for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
  const frameHash = (doc, i) => hash(E.renderFrame(E.compile(doc), i, 96, 24).data);
  const maxDiff = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };
  function check(suite, name, ok, detail = '') { results.push({ suite, name, ok: !!ok, detail }); }
  async function run(suite, name, fn) {
    try { const r = await fn(); if (r === true || r === undefined) check(suite, name, true); else check(suite, name, false, String(r)); }
    catch (e) { check(suite, name, false, 'threw: ' + e.message); }
  }

  // ---------- fingerprints ----------
  function fingerprints() {
    const fp = {};
    for (const id in PL.LAYERS) { const doc = Object.assign(E.blankDoc(), { layers: [E.newLayer(id)] }); fp['L:' + id] = frameHash(doc, 3) + '/' + frameHash(doc, 17); }
    for (const id in PL.EFFECTS) { const doc = Object.assign(E.blankDoc(), { layers: [E.newLayer('clouds'), E.newLayer('sparkles', { blend: 'screen' })], effects: [E.newEffect(id)] }); fp['E:' + id] = frameHash(doc, 3) + '/' + frameHash(doc, 17); }
    PL.ANIM_PRESETS.forEach((mk, i) => { const d = mk(); fp['P:' + i + ':' + d.name] = frameHash(d, 5); });
    return fp;
  }

  // Effects whose look changes in whole steps (they cycle through a fixed number of states per loop).
  const STEPPED = new Set(['L:matrix', 'L:truchet', 'L:lightning', 'L:skyline', 'E:glitch', 'E:grain', 'E:vhs', 'E:invert']);

  async function main() {
    const t0 = performance.now();
    const base = window.PL_BASELINE || {};
    const fp = fingerprints();
    window.__newBaseline = fp;
    for (const k of Object.keys(fp)) {
      if (!(k in base)) check('Render fingerprints', k, true, 'new (no baseline yet)');
      else check('Render fingerprints', k, fp[k] === base[k], fp[k] === base[k] ? '' : `got ${fp[k]}, baseline ${base[k]}`);
    }
    for (const k of Object.keys(base)) if (!(k in fp)) check('Render fingerprints', k, false, 'missing now (removed or renamed?)');

    // ---------- loop seams ----------
    const seam = (doc) => { const cp = E.compile(doc); return maxDiff(E.renderBuf(cp, 0, 96, 24, 0), E.renderBuf(cp, 1, 96, 24, 0)); };
    for (const id in PL.LAYERS) { if (STEPPED.has('L:' + id)) continue; await run('Loop seams', 'layer ' + id, () => { const d = seam(Object.assign(E.blankDoc(), { layers: [E.newLayer(id)] })); return d < 0.02 || `jump of ${d.toFixed(3)} at the loop point`; }); }
    for (const id in PL.EFFECTS) { if (STEPPED.has('E:' + id)) continue; await run('Loop seams', 'effect ' + id, () => { const d = seam(Object.assign(E.blankDoc(), { layers: [E.newLayer('linear')], effects: [E.newEffect(id)] })); return d < 0.02 || `jump of ${d.toFixed(3)}`; }); }
    for (const m of ['float', 'bounce', 'sway', 'orbit', 'figure8', 'wander', 'driftR', 'rise', 'fall', 'path']) {
      await run('Loop seams', 'element motion ' + m, () => { const d = seam(Object.assign(E.blankDoc(), { layers: [E.newLayer('shape', { params: { motion: m, layout: 'scatter', count: 5, pulse: 0.5, blink: 0.5 } })] })); return d < 0.02 || `jump of ${d.toFixed(3)}`; });
    }
    await run('Loop seams', 'keyframed values', () => { const d = seam(Object.assign(E.blankDoc(), { layers: [E.newLayer('shape', { params: { layout: 'single', motion: 'none' }, keys: { 'params.size': [{ t: 0, v: 0.2 }, { t: 0.6, v: 1 }], 'xf.rotate': [{ t: 0.3, v: -40 }, { t: 0.8, v: 40 }] } })] })); return d < 0.02 || `jump of ${d.toFixed(3)}`; });

    // ---------- keyframes, clip, groups ----------
    await run('Engine', 'keyframes interpolate and wrap', () => {
      const ks = [{ t: 0.25, v: 10, e: 'linear' }, { t: 0.75, v: 30, e: 'linear' }];
      const a = E.keyValue(ks, 0.5), b = E.keyValue(ks, 0), c = E.keyValue(ks, 0.875);
      return (a === 20 && Math.abs(b - 20) < 1e-9 && Math.abs(c - 25) < 1e-9) || `0.5→${a}, 0→${b}, 0.875→${c}`;
    });
    await run('Engine', 'hold keys keep their value', () => E.keyValue([{ t: 0, v: 1, e: 'hold' }, { t: 0.5, v: 5 }], 0.4) === 1);
    await run('Engine', 'clip to layer below', () => {
      const cp = E.compile(Object.assign(E.blankDoc(), { layers: [E.newLayer('shape', { params: { kind: 'circle', layout: 'single', motion: 'none', size: 0.5 } }), E.newLayer('linear', { clip: true })] }));
      const img = E.renderFrame(cp, 0, 96, 24);
      return (img.data[3] === 0 && img.data[((12 * 96) + 48) * 4 + 3] > 200) || 'clipped layer leaks outside the shape';
    });
    await run('Engine', 'hidden group hides its layers', () => E.compile(E.sanitizeDoc({ layers: [{ type: 'linear', group: 'g' }], groups: [{ id: 'g', visible: false }] }).doc).layers.length === 0);

    // ---------- sanitising ----------
    await run('Sanitising', 'hostile project is clamped', () => {
      const { doc, dropped } = E.sanitizeDoc({ width: 1e6, height: 'x', fps: 7, duration: 1e9, layers: [null, { type: 'nope' }, { type: 'shape', params: { count: 1e9, kind: 'bogus' } }], shadows: [{ x_offset: 1e9 }] });
      return (doc.width === 1024 && doc.height === 64 && doc.fps === 25 && doc.duration === 8 && dropped === 2 && doc.layers[0].params.count === 80 && doc.layers[0].params.kind === 'heart' && doc.shadows[0].x_offset === 10) || JSON.stringify({ w: doc.width, h: doc.height, fps: doc.fps, dur: doc.duration, dropped, count: doc.layers[0] && doc.layers[0].params.count });
    });
    await run('Sanitising', 'bad keyframe paths are dropped', () => { const d = E.sanitizeDoc({ layers: [{ type: 'linear', keys: { 'params.angle': [{ t: 0, v: 1 }], 'constructor.x': [{ t: 0, v: 1 }], 'xf.rotate': [{ t: 'a', v: 1 }] } }] }).doc; return JSON.stringify(Object.keys(d.layers[0].keys || {})) === '["params.angle"]' || JSON.stringify(d.layers[0].keys); });
    await run('Sanitising', 'image links: only http(s), escaped in CSS', () => {
      const bad = PL.Paint.gradientCss({ function: 'URL', image_url: 'javascript:alert(1)' }), ok = PL.Paint.gradientCss({ function: 'URL', image_url: 'https://cdn.example/a b".gif' });
      return (bad === 'none' && ok === 'url("https://cdn.example/a%20b%22.gif")') || bad + ' / ' + ok;
    });
    await run('Sanitising', '7TV import normalises angle and colours', () => { const r = PL.Paint.normalize({ angle: 370, stops: [{ at: 50, color: 'zz' }, { at: 100, color: '#ff000080' }] }, true); return (r.paint.angle === 10 && r.paint.stops[0].at === 0.5 && r.paint.stops[1].color === PL.packRGBA(255, 0, 0, 128) && r.warnings.length === 2) || JSON.stringify(r); });

    // ---------- 7TV format ----------
    await run('7TV format', 'colour packing round-trips', () => PL.decToCss(PL.hexAlphaToDec('#bf2b2b', 1)) === 'rgba(191, 43, 43, 1.000)' && PL.hexAlphaToDec('#bf2b2b', 1) === -1087689729);
    await run('7TV format', 'CSS matches the extension', () => { const css = PL.Paint.gradientCss(PL.Paint.normalize({ function: 'LINEAR_GRADIENT', angle: 90, stops: [{ at: 0.29, color: 255 }, { at: 0.86, color: -1087689729 }] })); return css === 'linear-gradient(90deg, rgba(0, 0, 0, 1.000) 28.999999999999996%, rgba(191, 43, 43, 1.000) 86%)' || css; });

    // ---------- 7TV layered format ----------
    await run('7TV format', 'layered paints round-trip through JSON', () => {
      const src = { name: 'L', gradients: [
        { function: 'LINEAR_GRADIENT', canvas_repeat: 'no-repeat', size: [0.5, 1], at: [1, 0], angle: 90, repeat: false, stops: [{ at: 0, color: -1 }, { at: 1, color: 255 }] },
        { function: 'RADIAL_GRADIENT', canvas_repeat: 'repeat-x', size: [1, 1], at: [0, 0], shape: 'circle', repeat: false, stops: [{ at: 0, color: -16776961 }] }],
        text: { weight: 9, stroke: { color: 255, width: 1.5 } }, shadows: [] };
      const a = PL.Paint.normalize(src), json = JSON.parse(PL.Paint.toJson(a)), b = PL.Paint.normalize(json);
      return (json.gradients && json.gradients.length === 2 && json.gradients[0].size[0] === 0.5 && json.text && json.text.weight === 9 && PL.Paint.toJson(b) === PL.Paint.toJson(a)) || PL.Paint.toJson(a).slice(0, 200);
    });
    await run('7TV format', 'a plain paint still exports the classic shape', () => { const j = JSON.parse(PL.Paint.toJson(PL.Paint.normalize({ function: 'LINEAR_GRADIENT', angle: 45, stops: [{ at: 0, color: 255 }] }))); return (j.function === 'LINEAR_GRADIENT' && !j.gradients) || JSON.stringify(j); });

    // ---------- surprise ----------
    if (PL.Surprise) {
      await run('Surprise me', 'animated surprises are readable and loop', () => {
        for (let i = 0; i < 6; i++) { const d = PL.Surprise.make(1000 + i), m = PL.Surprise.measure(d); if (!(m.luma >= 0.2 && m.luma <= 0.95)) return `${d.name}: luma ${m.luma}`; const s = seam(d); if (s > 0.02 && !d.layers.some((l) => STEPPED.has('L:' + l.type))) return `${d.name}: seam ${s.toFixed(3)}`; }
        return true;
      });
      await run('Surprise me', 'static surprises are valid 7TV paints', () => { for (let i = 0; i < 6; i++) { const p = PL.Surprise.makeStatic(i + 5); const j = JSON.parse(PL.Paint.toJson(PL.Paint.normalize(p))); if (!(j.stops || j.gradients)) return JSON.stringify(j); } return true; });
    }

    // ---------- palettes ----------
    await run('Palettes', 'strength sets the share', () => { const st = PL.paletteToStops({ colors: [{ c: '#ff0000', a: 1, w: 3 }, { c: '#0000ff', a: 1, w: 1 }], blend: 0, loop: false }); const red = st.filter((s) => s.color === '#ff0000').map((s) => s.at); return Math.abs(Math.max(...red) - 0.75) < 1e-9 || JSON.stringify(st); });
    await run('Palettes', 'looped palettes join end to start', () => { const st = PL.paletteToStops({ colors: [{ c: '#ff0000', a: 1, w: 1 }, { c: '#0000ff', a: 1, w: 1 }], blend: 1, loop: true }); return st[0].color === st[st.length - 1].color || JSON.stringify(st); });

    // ---------- encoders ----------
    const decode = (blob) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = URL.createObjectURL(blob); });
    const doc = PL.ANIM_PRESETS[17] ? PL.ANIM_PRESETS[17]() : E.blankDoc();
    const cp = E.compile(doc), frames = [0, 1, 2, 3, 4, 5].map((i) => E.renderFrame(cp, i));
    await run('Encoders', 'GIF decodes with close colours', async () => {
      const blob = PL.Encode.encodeGif(frames, { delayCs: 4, colors: 256 });
      const im = await decode(blob); if (!im) return 'browser could not decode the GIF';
      const c = document.createElement('canvas'); c.width = cp.W; c.height = cp.H; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
      const a = x.getImageData(0, 0, cp.W, cp.H).data, b = frames[0].data; let err = 0; for (let i = 0; i < a.length; i += 4) err += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
      const mean = err / (cp.W * cp.H * 3); return mean < 6 || `mean colour error ${mean.toFixed(2)}`;
    });
    await run('Encoders', 'transparent GIF decodes', async () => !!(await decode(PL.Encode.encodeGif([new ImageData(32, 8)], { delayCs: 4 }))) || 'did not decode');
    await run('Encoders', 'change-only GIF frames decode', async () => !!(await decode(PL.Encode.encodeGif(frames, { delayCs: 4, diff: 'force' }))) || 'did not decode');
    await run('Encoders', 'per-frame palette GIF decodes', async () => !!(await decode(PL.Encode.encodeGif(frames, { delayCs: 4, localPalettes: true }))) || 'did not decode');
    if (window.CompressionStream) await run('Encoders', 'APNG decodes', async () => { const im = await decode(await PL.Encode.encodeApng(frames, { delayMs: 40 })); return (im && im.naturalWidth === cp.W) || 'did not decode'; });
    if (PL.Render && PL.Render.available()) await run('Render worker', 'worker frames match the main thread', async () => { const r = await PL.Render.selfTest(); return r.ok || r.detail; });
    else check('Render worker', 'worker available in this page', true, 'not available here (unbundled page or no OffscreenCanvas): exports use the main thread');
    if (PL.Encode.encodeWebp) await run('Encoders', 'animated WebP decodes', async () => { const blob = await PL.Encode.encodeWebp(frames, { delayMs: 40, quality: 0.9 }); const im = await decode(blob); return (im && im.naturalWidth === cp.W) || 'did not decode'; });

    render(performance.now() - t0);
  }

  function render(ms) {
    const fails = results.filter((r) => !r.ok);
    summary.textContent = `${fails.length ? fails.length + ' failed, ' : ''}${results.length - fails.length} of ${results.length} passed in ${PL.fmtNum(ms / 1000, 1)} s`;
    summary.className = fails.length ? 'fail' : 'pass';
    const bySuite = new Map();
    for (const r of results) { if (!bySuite.has(r.suite)) bySuite.set(r.suite, []); bySuite.get(r.suite).push(r); }
    out.textContent = '';
    for (const [suite, list] of bySuite) {
      const bad = list.filter((r) => !r.ok).length;
      const det = document.createElement('details'); det.open = bad > 0;
      const sum = document.createElement('summary'); sum.textContent = `${suite} · ${list.length - bad} / ${list.length}`; if (bad) sum.className = 'fail';
      det.append(sum);
      for (const r of (bad ? list.filter((x) => !x.ok).concat(list.filter((x) => x.ok)) : list)) {
        const row = document.createElement('div'); row.className = 'r ' + (r.ok ? 'pass' : 'fail');
        row.textContent = (r.ok ? 'pass  ' : 'FAIL  ') + r.name + (r.detail ? '  (' + r.detail + ')' : '');
        det.append(row);
      }
      out.append(det);
    }
  }

  document.getElementById('copyBaseline').addEventListener('click', async () => {
    const txt = '/* Render fingerprints for js/tests.js. Regenerate from the test page after an intentional visual change. */\nwindow.PL_BASELINE = ' + JSON.stringify(window.__newBaseline || {}, null, 0) + ';\n';
    try { await navigator.clipboard.writeText(txt); document.getElementById('copyBaseline').textContent = 'Copied'; }
    catch (e) { const ta = document.getElementById('baselineOut'); ta.hidden = false; ta.value = txt; ta.select(); }
  });
  document.getElementById('rerun').addEventListener('click', () => { results.length = 0; summary.textContent = 'Running…'; summary.className = ''; setTimeout(safeMain, 30); });
  const safeMain = () => main().catch((e) => { check('Runner', 'test run', false, 'crashed: ' + e.message); render(0); });
  setTimeout(safeMain, 30);
})(window.PL);
