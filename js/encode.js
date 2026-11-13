/* Local encoders, no libraries: animated GIF (median-cut palette + LZW) and APNG (zlib via the
   browser's built-in CompressionStream). Frames are ImageData objects of equal size. */
(function (PL) {
  'use strict';

  class ByteOut {
    constructor() { this.buf = new Uint8Array(1 << 16); this.n = 0; }
    grow(k) { if (this.n + k > this.buf.length) { let s = this.buf.length; while (s < this.n + k) s *= 2; const b = new Uint8Array(s); b.set(this.buf.subarray(0, this.n)); this.buf = b; } }
    byte(b) { this.grow(1); this.buf[this.n++] = b; }
    bytes(a) { this.grow(a.length); this.buf.set(a, this.n); this.n += a.length; }
    u16(v) { this.byte(v & 255); this.byte((v >> 8) & 255); }
    str(s) { for (let i = 0; i < s.length; i++) this.byte(s.charCodeAt(i)); }
    result() { return this.buf.slice(0, this.n); }
  }

  // ---------- palette ----------
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v / 16 - 0.5));

  // Median cut over a 15-bit histogram of every frame's opaque pixels.
  function buildPalette(frames, maxColors, alphaCut) {
    const hist = new Uint32Array(32768);
    for (const f of frames) {
      const d = f.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < alphaCut) continue;
        hist[((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3)]++;
      }
    }
    const cols = [];
    for (let k = 0; k < 32768; k++) if (hist[k]) cols.push(k);
    if (!cols.length) return [[0, 0, 0]];
    const comp = (k, c) => (c === 0 ? (k >> 10) & 31 : c === 1 ? (k >> 5) & 31 : k & 31);
    let boxes = [{ cols, count: cols.reduce((a, k) => a + hist[k], 0) }];
    const rangeOf = (b) => {
      let best = 0, bc = 0;
      for (let c = 0; c < 3; c++) {
        let mn = 31, mx = 0;
        for (const k of b.cols) { const v = comp(k, c); if (v < mn) mn = v; if (v > mx) mx = v; }
        if (mx - mn > best) { best = mx - mn; bc = c; }
      }
      return [best, bc];
    };
    while (boxes.length < maxColors) {
      let pick = -1, score = 0, pc = 0;
      boxes.forEach((b, i) => {
        if (b.cols.length < 2) return;
        const [r, c] = rangeOf(b);
        const s = r * Math.sqrt(b.count);
        if (s > score) { score = s; pick = i; pc = c; }
      });
      if (pick < 0) break;
      const b = boxes[pick];
      b.cols.sort((x, y) => comp(x, pc) - comp(y, pc));
      let acc = 0, half = b.count / 2, cut = 1;
      for (let i = 0; i < b.cols.length - 1; i++) { acc += hist[b.cols[i]]; if (acc >= half) { cut = i + 1; break; } cut = i + 1; }
      const A = b.cols.slice(0, cut), B = b.cols.slice(cut);
      const cnt = (l) => l.reduce((a, k) => a + hist[k], 0);
      boxes.splice(pick, 1, { cols: A, count: cnt(A) }, { cols: B, count: cnt(B) });
    }
    return boxes.map((b) => {
      let r = 0, g = 0, bl = 0, n = 0;
      for (const k of b.cols) { const w = hist[k]; r += (((k >> 10) & 31) * 8 + 4) * w; g += (((k >> 5) & 31) * 8 + 4) * w; bl += ((k & 31) * 8 + 4) * w; n += w; }
      return [Math.round(r / n), Math.round(g / n), Math.round(bl / n)];
    });
  }

  function makeMapper(pal, offset) {
    const cache = new Int16Array(32768).fill(-1);
    return (r, g, b) => {
      const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      let v = cache[k];
      if (v >= 0) return v;
      let best = 1e9;
      for (let i = 0; i < pal.length; i++) {
        const p = pal[i], dr = p[0] - r, dg = p[1] - g, db = p[2] - b;
        const dd = dr * dr * 2 + dg * dg * 4 + db * db * 3;
        if (dd < best) { best = dd; v = i; }
      }
      cache[k] = v + offset;
      return v + offset;
    };
  }

  // ---------- LZW (same scheme as omggif) ----------
  function lzw(out, minCode, idx) {
    out.byte(minCode);
    const clear = 1 << minCode, eoi = clear + 1;
    let codeSize = minCode + 1, next = eoi + 1;
    let table = new Map();
    let cur = 0, shift = 0;
    const block = new Uint8Array(255); let bn = 0;
    const flushByte = (b) => { block[bn++] = b; if (bn === 255) { out.byte(255); out.bytes(block); bn = 0; } };
    const emit = (code) => { cur |= code << shift; shift += codeSize; while (shift >= 8) { flushByte(cur & 255); cur >>>= 8; shift -= 8; } };
    emit(clear);
    let ib = idx[0];
    for (let i = 1; i < idx.length; i++) {
      const k = idx[i], key = (ib << 8) | k;
      const c = table.get(key);
      if (c === undefined) {
        emit(ib);
        if (next === 4096) { emit(clear); next = eoi + 1; codeSize = minCode + 1; table = new Map(); }
        else { if (next >= 1 << codeSize) codeSize++; table.set(key, next++); }
        ib = k;
      } else ib = c;
    }
    emit(ib); emit(eoi);
    if (shift > 0) flushByte(cur & 255);
    if (bn) { out.byte(bn); out.bytes(block.subarray(0, bn)); }
    out.byte(0);
  }

  /* opts: { delayCs, colors (2..256), dither (bool), alphaCut (0..255), matte: [r,g,b] | null, loop } */
  function encodeGif(frames, opts = {}) {
    const W = frames[0].width, H = frames[0].height;
    const alphaCut = opts.alphaCut ?? 128;
    // With a matte, translucent pixels are blended onto it; fully transparent ones stay transparent.
    const src = frames.map((f) => {
      if (!opts.matte) return f;
      const o = new ImageData(W, H), d = f.data, e = o.data, m = opts.matte;
      for (let i = 0; i < d.length; i += 4) {
        const a = d[i + 3] / 255;
        e[i] = d[i] * a + m[0] * (1 - a); e[i + 1] = d[i + 1] * a + m[1] * (1 - a); e[i + 2] = d[i + 2] * a + m[2] * (1 - a);
        e[i + 3] = opts.keepAlpha && d[i + 3] < alphaCut ? 0 : 255;
      }
      return o;
    });
    const hasAlpha = src.some((f) => { const d = f.data; for (let i = 3; i < d.length; i += 4) if (d[i] < alphaCut) return true; return false; });
    const maxC = Math.max(2, Math.min(256, opts.colors || 256)) - (hasAlpha ? 1 : 0);
    const pal = buildPalette(src, maxC, alphaCut);
    const offset = hasAlpha ? 1 : 0;
    let bits = 1; while ((1 << bits) < pal.length + offset) bits++;
    const size = 1 << bits;
    const map = makeMapper(pal, offset);

    const out = new ByteOut();
    out.str('GIF89a'); out.u16(W); out.u16(H);
    out.byte(0x80 | (7 << 4) | (bits - 1)); out.byte(0); out.byte(0);
    for (let i = 0; i < size; i++) {
      const c = i < offset ? [0, 0, 0] : pal[i - offset] || [0, 0, 0];
      out.byte(c[0]); out.byte(c[1]); out.byte(c[2]);
    }
    if (frames.length > 1) { out.bytes([0x21, 0xff, 0x0b]); out.str('NETSCAPE2.0'); out.bytes([3, 1]); out.u16(opts.loop ?? 0); out.byte(0); }
    const delay = Math.max(2, Math.round(opts.delayCs || 4));
    const idx = new Uint8Array(W * H);
    for (const f of src) {
      const d = f.data;
      for (let y = 0, p = 0; y < H; y++) {
        for (let x = 0; x < W; x++, p++) {
          const i = p * 4;
          if (hasAlpha && d[i + 3] < alphaCut) { idx[p] = 0; continue; }
          let r = d[i], g = d[i + 1], b = d[i + 2];
          if (opts.dither) {
            const n = BAYER[(y & 3) * 4 + (x & 3)] * 24;
            r = Math.max(0, Math.min(255, r + n)); g = Math.max(0, Math.min(255, g + n)); b = Math.max(0, Math.min(255, b + n));
          }
          idx[p] = map(r, g, b);
        }
      }
      // Graphic control: disposal 2 (restore to background) so transparent areas don't smear.
      out.bytes([0x21, 0xf9, 4, (hasAlpha ? 2 << 2 : 1 << 2) | (hasAlpha ? 1 : 0)]); out.u16(delay); out.byte(0); out.byte(0);
      out.byte(0x2c); out.u16(0); out.u16(0); out.u16(W); out.u16(H); out.byte(0);
      lzw(out, Math.max(2, bits), idx);
    }
    out.byte(0x3b);
    return new Blob([out.result()], { type: 'image/gif' });
  }

  // ---------- APNG ----------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(bytes, c = 0xffffffff) { for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8); return c; }
  const u32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  function chunk(out, type, data) {
    out.bytes(u32(data.length));
    const t = new Uint8Array([...type].map((c) => c.charCodeAt(0)));
    out.bytes(t); out.bytes(data);
    out.bytes(u32((crc32(data, crc32(t)) ^ 0xffffffff) >>> 0));
  }
  async function deflate(raw) {
    const cs = new CompressionStream('deflate');
    const stream = new Blob([raw]).stream().pipeThrough(cs);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  function filtered(f) { // filter type 1 (Sub) per row: cheap and compresses gradients well
    const W = f.width, H = f.height, d = f.data, raw = new Uint8Array(H * (W * 4 + 1));
    for (let y = 0; y < H; y++) {
      const o = y * (W * 4 + 1); raw[o] = 1;
      for (let x = 0; x < W * 4; x++) { const v = d[y * W * 4 + x]; raw[o + 1 + x] = (v - (x >= 4 ? d[y * W * 4 + x - 4] : 0)) & 255; }
    }
    return raw;
  }
  async function encodeApng(frames, opts = {}) {
    const W = frames[0].width, H = frames[0].height, out = new ByteOut();
    out.bytes([137, 80, 78, 71, 13, 10, 26, 10]);
    chunk(out, 'IHDR', new Uint8Array([...u32(W), ...u32(H), 8, 6, 0, 0, 0]));
    const anim = frames.length > 1;
    if (anim) chunk(out, 'acTL', new Uint8Array([...u32(frames.length), ...u32(opts.loop ?? 0)]));
    let seq = 0;
    const num = Math.max(1, Math.round(opts.delayMs || 40)), den = 1000;
    for (let i = 0; i < frames.length; i++) {
      if (anim) {
        chunk(out, 'fcTL', new Uint8Array([...u32(seq++), ...u32(W), ...u32(H), ...u32(0), ...u32(0), (num >> 8) & 255, num & 255, (den >> 8) & 255, den & 255, 1, 0]));
      }
      const z = await deflate(filtered(frames[i]));
      if (i === 0) chunk(out, 'IDAT', z);
      else { const d = new Uint8Array(z.length + 4); d.set(u32(seq++)); d.set(z, 4); chunk(out, 'fdAT', d); }
    }
    chunk(out, 'IEND', new Uint8Array(0));
    return new Blob([out.result()], { type: anim ? 'image/apng' : 'image/png' });
  }

  PL.Encode = { encodeGif, encodeApng };
})(window.PL);
