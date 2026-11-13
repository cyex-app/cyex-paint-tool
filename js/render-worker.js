/* Renders animation frames in a Web Worker so long exports don't freeze the page.
   The worker runs the very same engine files as the page (their inline source, collected from the
   bundled page's script[data-engine] tags), so the frames match the main thread.
   PL.Render.available() says whether this works here; if not, the caller renders on the page. */
(function (PL) {
  'use strict';
  // The tag this file came in, so it is never fed to the worker even if it carries data-engine.
  const ownScript = typeof document !== 'undefined' ? document.currentScript : null;
  const READY_TIMEOUT = 10000; // ms for the worker to load the engine before we give up on it
  const CANCEL_POLL = 100; // ms; also checks isCancelled() between progress messages, for slow frames

  // ---- engine source ----
  // Inline code of every engine script, in page order. In the unbundled index.html they are
  // external src scripts with no text, and a worker can't load them by path from file:// or a
  // data: URL page, so that case returns null and the caller falls back.
  function collectSources() {
    if (typeof document === 'undefined') return null;
    const parts = [];
    for (const s of document.querySelectorAll('script[data-engine]')) {
      const name = s.getAttribute('data-src') || s.getAttribute('src') || 'inline';
      if (s === ownScript || /render-worker\.js$/.test(name)) continue;
      const code = s.textContent;
      if (!code || !code.trim()) return null;
      parts.push({ name, code });
    }
    return parts.length ? parts : null;
  }

  // Set up the worker global before the engine files run. They all do `window.PL = window.PL || {}`
  // and `})(window.PL)`, so window must be the worker global. `document` is deliberately left
  // undefined: PL.makeCanvas uses that to pick OffscreenCanvas. The other stubs aren't read by the
  // engine files today (checked); they keep a future load-time use from killing the worker.
  const PRELUDE = [
    'self.window = self;',
    "if (!('devicePixelRatio' in self)) self.devicePixelRatio = 1;",
    "if (typeof self.matchMedia !== 'function') self.matchMedia = function (q) { return { matches: false, media: String(q), onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }; };",
    "if (!('localStorage' in self)) { const m = new Map(); self.localStorage = { getItem: (k) => (m.has(String(k)) ? m.get(String(k)) : null), setItem: (k, v) => { m.set(String(k), String(v)); }, removeItem: (k) => { m.delete(String(k)); }, clear: () => m.clear(), key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } }; }",
  ].join('\n');

  // Runs inside the worker (injected as source text, so it must not close over anything here).
  function workerMain() {
    const PL = self.PL;
    const cancelled = new Set();
    // Yield a task between frames so a cancel message can land. A MessageChannel isn't clamped
    // to 4 ms the way nested setTimeout is, which would add up over hundreds of frames.
    const waiters = [], ch = new MessageChannel();
    ch.port1.onmessage = () => { const r = waiters.shift(); if (r) r(); };
    const yieldTask = () => new Promise((r) => { waiters.push(r); ch.port2.postMessage(0); });

    self.onmessage = async (e) => {
      const m = e.data || {};
      if (m.cancel) { cancelled.add(m.id); return; }
      if (m.type !== 'render') return;
      const id = m.id;
      try {
        // pictures arrive once per worker and stay; `canvas` is built lazily by elements.js
        for (const im of m.images || []) PL.imageCache[im.src] = { w: im.w, h: im.h, data: im.data };
        const cp = PL.Engine.compile(m.doc), total = cp.frames;
        const W = m.W || cp.W, H = m.H || cp.H;
        for (let i = 0; i < total; i++) {
          if (cancelled.has(id)) { cancelled.delete(id); return; }
          const img = PL.Engine.renderFrame(cp, i, W, H), buf = img.data.buffer;
          self.postMessage({ type: 'frame', id, i, total, W, H, buf }, [buf]);
          await yieldTask();
        }
        self.postMessage({ type: 'done', id, total });
      } catch (err) {
        self.postMessage({ type: 'error', id, message: (err && err.message) || String(err) });
      }
    };
    self.postMessage({ type: 'ready' });
  }

  function buildSource(parts) {
    const files = parts.map((p) => '// ---- ' + p.name + ' ----\n' + p.code + '\n;');
    return PRELUDE + '\n' + files.join('\n') + '\n(' + workerMain.toString() + ')();\n';
  }

  // ---- availability ----
  let avail = null, source = null;
  function available() {
    if (avail !== null) return avail;
    avail = false;
    try {
      if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return avail;
      if (typeof OffscreenCanvas === 'undefined' || !new OffscreenCanvas(1, 1).getContext('2d')) return avail;
      const parts = collectSources();
      if (!parts) return avail;
      source = buildSource(parts);
      avail = true;
    } catch (e) { avail = false; }
    return avail;
  }

  // ---- worker lifecycle ----
  // One worker is reused across calls; it is terminated on cancel or error and recreated lazily.
  let worker = null, starting = null, current = null, sent = new Set(), jobId = 0;
  const unavailable = () => new Error('worker-unavailable');

  function kill() {
    if (worker) { try { worker.terminate(); } catch (e) { /* already gone */ } }
    worker = null; starting = null; sent = new Set();
  }

  function startWorker() {
    if (starting) return starting;
    if (!available()) return Promise.reject(unavailable());
    starting = new Promise((resolve, reject) => {
      let url = null, w = null, ready = false, timer = 0;
      const fail = () => {
        clearTimeout(timer);
        if (url) URL.revokeObjectURL(url);
        // a worker that can't start here won't start next time either: let the caller fall back for good
        avail = false; kill(); reject(unavailable());
      };
      try {
        url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
        w = new Worker(url);
      } catch (e) { fail(); return; }
      worker = w;
      timer = setTimeout(() => { if (!ready) fail(); }, READY_TIMEOUT);
      w.onmessage = (e) => {
        const m = e.data || {};
        if (m.type === 'ready') { ready = true; clearTimeout(timer); URL.revokeObjectURL(url); resolve(w); return; }
        if (current && m.id === current.id) current.onMessage(m);
      };
      w.onerror = (e) => {
        if (e && e.preventDefault) e.preventDefault(); // we report it ourselves
        if (!ready) { fail(); return; }
        const err = new Error((e && e.message) || 'Render worker failed');
        const job = current; kill();
        if (job) job.fail(err);
      };
      w.onmessageerror = () => { const job = current; kill(); if (job) job.fail(new Error('Render worker sent unreadable data')); };
    });
    return starting;
  }

  // Pictures (PL.imageCache entries) the doc's layers point at that this worker hasn't seen yet.
  // Keys are data: URLs, so the same key always means the same pixels.
  function imagesFor(doc) {
    const out = [];
    for (const l of doc.layers || []) {
      const src = l && l.params && l.params.src, im = typeof src === 'string' && PL.imageCache[src];
      if (!im || sent.has(src)) continue;
      out.push({ src, w: im.w, h: im.h, data: im.data }); // copied by postMessage; the page keeps its own
    }
    return out;
  }

  // ---- rendering ----
  function runJob(doc, opts) {
    const { onProgress, isCancelled, W, H } = opts || {};
    const cancelledNow = () => !!(isCancelled && isCancelled());
    if (cancelledNow()) return Promise.reject(new Error('cancelled'));
    return startWorker().catch(() => { throw unavailable(); }).then((w) => new Promise((resolve, reject) => {
      const id = ++jobId, out = [];
      let done = 0, poll = 0, over = false;
      const finish = (err, val) => {
        if (over) return;
        over = true; clearInterval(poll);
        if (current && current.id === id) current = null;
        if (err) reject(err); else resolve(val);
      };
      const cancel = () => {
        try { w.postMessage({ cancel: true, id }); } catch (e) { /* worker gone */ }
        kill(); finish(new Error('cancelled'));
      };
      current = {
        id,
        fail: (err) => finish(err),
        onMessage(m) {
          try {
            if (m.type === 'frame') {
              out[m.i] = new ImageData(new Uint8ClampedArray(m.buf), m.W, m.H);
              done++;
              if (onProgress) onProgress(done, m.total);
              if (cancelledNow()) cancel();
            } else if (m.type === 'done') {
              finish(null, out);
            } else if (m.type === 'error') {
              kill(); finish(new Error(m.message || 'Render worker failed'));
            }
          } catch (err) { kill(); finish(err); } // e.g. onProgress threw
        },
      };
      try {
        const images = imagesFor(doc);
        w.postMessage({ type: 'render', id, doc, images, W, H });
        for (const im of images) sent.add(im.src);
      } catch (err) { kill(); finish(err); return; } // e.g. a doc that can't be cloned
      poll = setInterval(() => { if (!over && cancelledNow()) cancel(); }, CANCEL_POLL);
    }));
  }

  // Calls run one after another on the shared worker; a failed call doesn't block the next.
  let queue = Promise.resolve();
  function frames(doc, opts) {
    const run = queue.then(() => runJob(doc, opts));
    queue = run.catch(() => {});
    return run;
  }

  // ---- self-check ----
  // Renders two small 3-frame docs in the worker and on the page and compares the bytes:
  // per-pixel layers and effects must match exactly, canvas-drawn elements within 1 per channel.
  function compare(a, b) {
    let max = 0, px = 0;
    if (a.length !== b.length) return { max: 255, px: -1 };
    for (let f = 0; f < a.length; f++) {
      const x = a[f].data, y = b[f].data;
      if (x.length !== y.length) return { max: 255, px: -1 };
      for (let i = 0; i < x.length; i += 4) {
        let d = 0;
        for (let k = 0; k < 4; k++) { const v = Math.abs(x[i + k] - y[i + k]); if (v > d) d = v; }
        if (d) { px++; if (d > max) max = d; }
      }
    }
    return { max, px };
  }

  async function selfTest() {
    if (!available()) return { ok: false, detail: 'Worker rendering unavailable here (unbundled page, or no OffscreenCanvas).' };
    const E = PL.Engine;
    // a small picture with soft alpha, so both the image layer and the picture element get used
    const key = 'data:image/x-cyex-selftest;' + Date.now(), iw = 12, ih = 8, data = new Uint8ClampedArray(iw * ih * 4);
    for (let y = 0, i = 0; y < ih; y++) for (let x = 0; x < iw; x++, i += 4) { data[i] = x * 21; data[i + 1] = y * 32; data[i + 2] = (x * y * 7) & 255; data[i + 3] = 96 + ((x + y) & 3) * 53; }
    PL.imageCache[key] = { w: iw, h: ih, data };
    const mk = (layers, effects = []) => Object.assign(E.blankDoc(), { name: 'Self-test', width: 48, height: 20, fps: 10, duration: 0.3, layers, effects });
    const cases = [
      ['per-pixel', 0, mk([E.newLayer('plasma'), E.newLayer('image', { opacity: 0.7, params: { src: key, tx: 2, sx: 1 } })], [E.newEffect('hue')])],
      // canvas-drawn edges may differ by a couple of levels: the page canvas can draw on the GPU, the worker's
      // OffscreenCanvas on the CPU, so antialiasing differs slightly (2/255 measured in Chrome; invisible)
      ['canvas-drawn', 3, mk([E.newLayer('linear'), E.newLayer('shape'), E.newLayer('glyph', { params: { text: 'Ab' } }), E.newLayer('sprite', { params: { src: key } })])],
    ];
    try {
      const notes = [];
      let ok = true;
      for (const [name, tol, doc] of cases) {
        const cp = E.compile(PL.clone(doc)), page = [];
        for (let i = 0; i < cp.frames; i++) page.push(E.renderFrame(cp, i));
        const off = await frames(PL.clone(doc));
        const r = compare(page, off);
        const pass = r.px >= 0 && r.max <= tol;
        ok = ok && pass;
        notes.push(`${name}: ${r.px < 0 ? 'frame count or size differs' : `max diff ${r.max}, ${r.px} px differ`} (allowed ${tol})${pass ? '' : ' FAIL'}`);
      }
      return { ok, detail: notes.join('; ') };
    } catch (err) {
      return { ok: false, detail: 'Error: ' + ((err && err.message) || err) };
    } finally {
      delete PL.imageCache[key];
    }
  }

  PL.Render = { available, frames, selfTest };
})(window.PL);
