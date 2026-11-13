/* cyex paints: animated export (GIF, WebP, APNG, sprite sheet, name GIF), the size estimate and the export result. */
(function (PL) {
  'use strict';
  const { h, icon, btn, panel, slider, seg, checkbox, labeled, dialog, toast, download, slug } = PL.UI;
  const E = PL.Engine, Paint = PL.Paint, clone = PL.clone;
  const A = (PL.App = PL.App || {});

  // ---- animated export ----
  let lastExport = null, exporting = null;
  const setExport = (rec) => { if (lastExport && lastExport.url) URL.revokeObjectURL(lastExport.url); lastExport = rec; };
  function animOutput() {
    const d = A.state.anim, g = A.state.gif;
    // saved states from before these options existed
    g.format = ['gif', 'webp', 'apng'].includes(g.format) ? g.format : 'gif';
    g.webpQuality = typeof g.webpQuality === 'number' ? g.webpQuality : 0.9;
    g.diff = g.diff !== false;
    g.localPal = !!g.localPal;
    const FMT = { gif: 'GIF', webp: 'WebP', apng: 'APNG' };
    const result = h('div', { class: 'stack', id: 'exportResult' });
    if (lastExport) showResult(result, lastExport);
    const exportBtns = [];
    // Cancel always sits in its own row (no layout shift); it's only enabled while frames render.
    // Encoding can't be interrupted, so Cancel is disabled then. Progress is announced politely.
    const cancelB = btn('Cancel export', () => { if (exporting) exporting.cancel = true; }, 'ghost small', 'x');
    cancelB.disabled = true;
    const status = h('span', { class: 'stat', role: 'status', 'aria-live': 'polite' });

    // Every export works on a snapshot of the paint taken when it starts, so editing meanwhile
    // can't mix frames. Only one export runs at a time, and it can be cancelled.
    async function runExport(b, work) {
      if (exporting) return;
      const doc = clone(A.state.anim);
      if (!doc.layers.some((l) => l.visible)) { toast('There is nothing to export yet. Add or show a layer first.'); return; }
      const cp = E.compile(doc);
      const px = cp.W * cp.H * cp.frames;
      if (px > 12e6 && !(await confirmHeavy(cp))) return;
      exporting = { cancel: false };
      const job = exporting;
      const old = [...b.childNodes];
      const hadFocus = document.activeElement === b || document.activeElement === document.body;
      exportBtns.forEach((x) => (x.disabled = true));
      lockFormat(true);
      b.replaceChildren(h('span', { class: 'spinner' }), h('span', null, 'Rendering…'));
      cancelB.disabled = false;
      if (hadFocus) cancelB.focus(); // the button that had focus is now disabled; keep keyboard users on a live control
      let lastAnnounce = 0;
      const update = (txt, force) => {
        b.lastChild.textContent = txt;
        const now = performance.now(); if (force || now - lastAnnounce > 1500) { status.textContent = txt; lastAnnounce = now; }
      };
      const frames = async () => {
        const out = await renderFrames(doc, cp, job, (i, n) => update(`Rendering ${Math.min(n, i + 1)} / ${n}`));
        if (job.cancel) throw new Error('cancelled');
        cancelB.disabled = true;
        update('Encoding…', true); await new Promise((r) => setTimeout(r, 20));
        return out;
      };
      try { await work({ doc, cp, frames }); status.textContent = 'Export finished.'; }
      catch (e) { status.textContent = ''; if (e.message === 'cancelled') toast('Export cancelled.'); else { console.error(e); toast('Couldn’t finish the export. Try a smaller size or a shorter loop.', 'error'); } }
      finally {
        const focusLost = document.activeElement === cancelB || document.activeElement === document.body;
        exporting = null;
        exportBtns.forEach((x) => (x.disabled = false));
        lockFormat(false);
        b.replaceChildren(...old);
        cancelB.disabled = true;
        if (focusLost && b.isConnected) b.focus();
      }
    }
    // The one place frames get rendered: the worker renderer when it exists, else the main-thread loop.
    async function renderFrames(doc, cp, job, onProgress) {
      if (PL.Render && PL.Render.available()) {
        return PL.Render.frames(doc, { onProgress, isCancelled: () => job.cancel });
      }
      const out = [];
      for (let i = 0; i < cp.frames; i++) {
        if (job.cancel) throw new Error('cancelled');
        out.push(E.renderFrame(cp, i));
        onProgress(i, cp.frames);
        await new Promise((r) => setTimeout(r));
      }
      return out;
    }
    const gifEncOpts = (doc) => ({
      delayCs: Math.round(100 / doc.fps), colors: g.colors, dither: g.dither, alphaCut: g.alpha ? 128 : 0,
      matte: g.alpha ? null : PL.hexToRgb(A.state.preview.color), diff: g.diff, localPalettes: g.localPal,
    });
    function confirmHeavy(cp) {
      return new Promise((resolve) => {
        let answered = false;
        const finish = (v) => { if (answered) return; answered = true; resolve(v); dlg.close(); };
        const dlg = dialog('Export a big file?', [h('p', null, `It renders ${PL.fmtInt(cp.frames)} frames at ${cp.W}×${cp.H}, which can take a minute and use a lot of memory. A smaller size, fewer frames per second or a shorter loop make it faster.`)], {
          footer: [btn('Cancel', () => finish(false), 'secondary'), btn('Export anyway', () => finish(true), 'primary')],
          onClose: () => { if (!answered) { answered = true; resolve(false); } },
        });
      });
    }
    const finishExport = (rec) => { setExport(rec); showResult(result, rec); download(rec.blob, rec.name); };

    const expB = btn('Export ' + FMT[g.format], () => runExport(expB, async ({ doc, cp, frames }) => {
      const fmt = g.format;
      if (fmt === 'apng' && !window.CompressionStream) { toast('This browser can’t make APNG files. Use a current Chrome, Edge or Firefox.', 'error'); return; }
      const fr = await frames();
      let blob, ext;
      if (fmt === 'gif') { blob = PL.Encode.encodeGif(fr, gifEncOpts(doc)); ext = '.gif'; }
      else if (fmt === 'apng') { blob = await PL.Encode.encodeApng(fr, { delayMs: 1000 / doc.fps }); ext = '.png'; }
      else {
        try { blob = await PL.Encode.encodeWebp(fr, { delayMs: 1000 / doc.fps, quality: g.webpQuality }); }
        catch (e) {
          if (e && e.message === 'webp-unsupported') { toast('This browser can’t make WebP files. Use a current Chrome or Edge.', 'error'); return; }
          throw e;
        }
        ext = '.webp';
      }
      finishExport({ blob, name: slug(doc.name) + ext, kind: FMT[fmt], w: cp.W, h: cp.H, frames: fr.length, shadows: doc.shadows });
    }), 'primary export-primary', 'film');
    const pngB = btn('Frame PNG', () => { if (!A.rt.texCv) return; A.rt.texCv.toBlob((b) => download(b, `${slug(d.name)}-frame-${A.rt.frame + 1}.png`)); }, 'secondary', 'image');
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
      const px = A.state.nameSize, m = A.measure(A.state.preview.text, px), pad = A.shadowPad(doc.shadows);
      const W = m.w + pad * 2, H = m.h + pad * 2;
      const cv = h('canvas', { width: W, height: H }), ctx = cv.getContext('2d', { willReadFrequently: true });
      const tex = h('canvas', { width: cp.W, height: cp.H }), tctx = tex.getContext('2d');
      const bg = A.state.preview.bg;
      const bgCol = bg === 'light' ? '#ffffff' : bg === 'dark' ? '#18181b' : null;
      const out = fr.map((f) => {
        tctx.putImageData(f, 0, 0);
        ctx.clearRect(0, 0, W, H);
        if (bgCol) { ctx.fillStyle = bgCol; ctx.fillRect(0, 0, W, H); }
        A.paintName(ctx, pad, pad, A.state.preview.text, px, tex, A.state.preview.color, doc.shadows, 1);
        return ctx.getImageData(0, 0, W, H);
      });
      const blob = PL.Encode.encodeGif(out, { delayCs: Math.round(100 / doc.fps), colors: g.colors, dither: g.dither, alphaCut: 110, diff: g.diff, localPalettes: g.localPal });
      finishExport({ blob, name: slug(doc.name) + '-name.gif', kind: 'Name GIF', w: W, h: H, frames: out.length, isName: true });
    }), 'secondary', 'film');
    exportBtns.push(expB, sheetB, nameB);

    // ---- size estimate: a few rendered frames, encoded and extrapolated, debounced ----
    const est = h('span', { class: 'stat export-est' }, 'Estimated size: –');
    let estTimer = 0, estSeq = 0, estSig = '';
    const sigOf = () => JSON.stringify([A.state.anim, g.format, g.colors, g.dither, g.alpha, g.diff, g.localPal, g.webpQuality, A.state.preview.color],
      (k, v) => (k === 'src' && typeof v === 'string' ? v.length : v));
    async function runEstimate() {
      const seq = ++estSeq;
      if (!est.isConnected || exporting) return;
      const doc = clone(A.state.anim), fmt = g.format;
      if (!doc.layers.some((l) => l.visible)) { estSig = ''; est.textContent = 'Estimated size: –'; return; }
      est.textContent = 'Estimated size: calculating…';
      await new Promise((r) => setTimeout(r));
      if (seq !== estSeq) return;
      try {
        const cp = E.compile(doc), n = cp.frames;
        let idx;
        if (n <= 6) idx = [...Array(n).keys()];
        else if (fmt === 'gif') { const m = Math.max(1, Math.floor(n / 2) - 1); idx = [0, m, m + 1, m + 2, m + 3]; }
        else idx = [...new Set([0, Math.floor(n / 3), Math.floor((2 * n) / 3), n - 1])];
        const fr = idx.map((i) => E.renderFrame(cp, i));
        const opts = fmt === 'gif' ? gifEncOpts(doc) : { delayMs: 1000 / doc.fps, quality: g.webpQuality };
        opts.total = n;
        const bytes = await PL.Encode.estimateSize(fr, fmt, opts);
        if (seq !== estSeq) return;
        est.textContent = 'Estimated size: ~' + PL.fmtBytes(bytes);
      } catch (e) {
        if (seq !== estSeq) return;
        estSig = '';
        est.textContent = e && e.message === 'webp-unsupported' ? 'WebP isn’t available in this browser.' : 'Couldn’t estimate the size. Try again.';
        if (!e || e.message !== 'webp-unsupported') console.warn(e);
      }
    }
    function scheduleEstimate(force) {
      clearTimeout(estTimer);
      estTimer = setTimeout(() => {
        if (!est.isConnected) return;
        const sg = sigOf();
        if (!force && sg === estSig) return;
        estSig = sg; runEstimate();
      }, 600);
    }
    // paint edits end in A.updateOutput(); hook it once so any edit refreshes the estimate
    if (!A.updateOutput || !A.updateOutput.exportHooked) {
      const orig = A.updateOutput;
      const hooked = function () { const r = orig && orig.apply(this, arguments); if (A.exportDirty) A.exportDirty(); return r; };
      hooked.exportHooked = true;
      A.updateOutput = hooked;
    }
    A.exportDirty = () => scheduleEstimate(false);
    const setOpt = (k) => (v) => { g[k] = v; A.save(); scheduleEstimate(false); };

    const gifOpts = h('div', { class: 'sub export-opts' }, h('span', { class: 'label' }, 'GIF options'),
      h('div', { class: 'row' }, h('span', { class: 'hint' }, 'Colours'), seg([[64, '64'], [128, '128'], [256, '256']], g.colors, setOpt('colors'), 'GIF colours')),
      checkbox('Dither (smoother gradients, larger file)', g.dither, setOpt('dither')),
      checkbox('Keep transparent areas (the name colour shows through)', g.alpha, setOpt('alpha')),
      checkbox('Only store changed pixels (smaller)', g.diff, setOpt('diff')),
      checkbox('Palette per frame (better colour, larger)', g.localPal, setOpt('localPal')),
      h('p', { class: 'hint' }, 'GIF has 256 colours and on/off transparency. WebP and APNG keep full colour and soft edges, and 7TV can show them too.'));
    const webpOpts = h('div', { class: 'sub export-opts' }, h('span', { class: 'label' }, 'WebP options'),
      slider('Quality', g.webpQuality, { min: 0.3, max: 1, step: 0.01, scale: 100, unit: '%', onInput: (v) => { g.webpQuality = v; A.save(); scheduleEstimate(false); } }),
      h('p', { class: 'hint' }, 'WebP is usually much smaller than GIF and keeps soft edges. 100 % is lossless.'));
    const apngOpts = h('p', { class: 'hint export-opts' }, 'APNG is lossless with soft edges, but files are large. It has no options.');
    const syncFormat = () => {
      gifOpts.hidden = g.format !== 'gif'; webpOpts.hidden = g.format !== 'webp'; apngOpts.hidden = g.format !== 'apng';
      if (expB.lastChild) expB.lastChild.textContent = 'Export ' + FMT[g.format];
    };
    const fmtSeg = seg([['gif', 'GIF'], ['webp', 'WebP'], ['apng', 'APNG']], g.format, (v) => { g.format = v; A.save(); syncFormat(); scheduleEstimate(false); }, 'Export format');
    const lockFormat = (on) => fmtSeg.querySelectorAll('button').forEach((x) => (x.disabled = on));
    syncFormat();
    scheduleEstimate(true);

    const nsz = slider('Name size', A.state.nameSize, { min: 12, max: 160, step: 1, unit: 'px', onInput: (v) => { A.state.nameSize = v; A.save(); } });

    // 7TV JSON for an image paint
    // the project preview leaves out embedded pictures (they can be megabytes); Save project keeps them
    const projectPreview = () => JSON.stringify({ cyexPaintProject: 1, doc: A.state.anim }, (k, v) => (k === 'src' && typeof v === 'string' && v.length > 80 ? '<picture data, kept in Save project>' : v), 2);
    A.outputGetter = () => (A.codeTab === 'project' ? projectPreview() : JSON.stringify({ name: A.state.anim.name, function: 'URL', repeat: false, angle: 0, shape: 'circle', image_url: A.state.url, stops: [], shadows: A.state.anim.shadows }, null, 2));
    if (A.codeTab === 'css') A.codeTab = 'json';
    const code = A.codeBox(A.outputGetter, [['json', '7TV JSON'], ['project', 'Project']]);
    const url = h('input', { class: 'field mono', value: A.state.url, placeholder: 'https://…/my-paint.gif', spellcheck: false, 'aria-label': 'Hosted image URL', oninput: () => { A.state.url = url.value.trim(); A.updateOutput(); A.save(); } });
    const saveP = btn('Save project', () => download(new Blob([JSON.stringify({ cyexPaintProject: 1, doc: A.state.anim })], { type: 'application/json' }), slug(d.name) + '.cyexpaint.json'), 'secondary small', 'save');
    const file = h('input', { type: 'file', accept: '.json,application/json', class: 'sr-only', onchange: async () => {
      const f = file.files[0]; if (!f) return;
      try {
        const obj = JSON.parse(await f.text());
        const msg = A.loadJson(obj); A.renderAll(); A.commit(); toast(msg, "success");
      } catch (e) { toast("Couldn’t open that file. Check it’s a paint or project file.", "error"); console.warn(e); }
    } });
    const openP = h('label', { class: 'btn secondary small' }, icon('folder'), 'Open project', file);

    return panel('Export', [
      h('div', { class: 'row export-format' }, h('span', { class: 'label' }, 'Format'), fmtSeg),
      h('div', { class: 'export-grid' }, expB, pngB, sheetB, nameB), h('div', { class: 'row' }, cancelB, status),
      result, gifOpts, webpOpts, apngOpts, est, nsz,
      h('div', { class: 'sub' }, h('span', { class: 'label' }, '7TV paint'),
        labeled('Where the image will be hosted', url),
        h('p', { class: 'hint' }, 'Animated paints are URL paints: upload the GIF, WebP or APNG somewhere public, paste the link, and the JSON below is ready.'),
        code, h('div', { class: 'row' }, saveP, openP)),
    ]);
  }
  function showResult(host, r) {
    host.textContent = '';
    if (!r.url) r.url = URL.createObjectURL(r.blob); // one URL per export, revoked when replaced
    const url = r.url;
    const sevenTv = r.isName ? null : h('span', { class: 'pname painted', style: { fontSize: '28px', color: A.state.preview.color, backgroundImage: `url("${url}")`, backgroundSize: '100% 100%', filter: Paint.filterCss({ shadows: r.shadows || A.state.anim.shadows }) } }, A.state.preview.text);
    host.append(h('div', { class: 'result' },
      h('img', { src: url, alt: r.kind + ' export' }),
      h('div', { class: 'ctl grow' },
        h('span', { class: 'stat' }, `${r.kind} · ${r.w}×${r.h} · ${r.frames} frames · ${PL.fmtBytes(r.blob.size)}`),
        sevenTv ? h('div', { class: 'stagebox ' + A.state.preview.bg, style: { padding: '10px 12px', border: '1px solid var(--border)' } }, sevenTv) : null,
        sevenTv ? h('span', { class: 'hint' }, 'Shown exactly the way 7TV applies an image paint.') : null,
        h('div', { class: 'row' }, btn('Download again', () => download(r.blob, r.name), 'ghost small', 'download')))));
  }

  Object.assign(A, { animOutput });
})(window.PL);
