/* cyex paints: painted-name rendering on canvas, matching the 7TV extension. */
(function (PL) {
  'use strict';
  const A = (PL.App = PL.App || {});

  // =====================================================================================
  // Painted-name rendering (canvas), matching the 7TV extension:
  // background-color: currentcolor; background-image stretched to the name box; clipped to text;
  // filter: drop-shadow(...) for each shadow.
  // =====================================================================================
  const NAME_FONT = getComputedStyle(document.documentElement).getPropertyValue('--name-font').trim() || 'system-ui, sans-serif';
  const mctx = document.createElement('canvas').getContext('2d');
  function measure(text, px) {
    mctx.font = `700 ${px}px ${NAME_FONT}`;
    const m = mctx.measureText(text || ' ');
    const asc = m.fontBoundingBoxAscent ?? px * 0.95, desc = m.fontBoundingBoxDescent ?? px * 0.25;
    return { w: Math.max(1, Math.ceil(m.width)), asc, desc, h: Math.ceil(asc + desc) };
  }
  const shadowFilter = (shadows, k = 1) => (shadows && shadows.length ? shadows.map((s) => `drop-shadow(${s.x_offset * k}px ${s.y_offset * k}px ${s.radius * k}px ${PL.decToCss(s.color)})`).join(' ') : 'none');
  const off = document.createElement('canvas'), offCtx = off.getContext('2d');
  function shadowPad(shadows) { let p = 2; for (const s of shadows || []) p = Math.max(p, Math.abs(s.x_offset) + s.radius * 2 + 2, Math.abs(s.y_offset) + s.radius * 2 + 2); return Math.ceil(p); }

  // Draw a painted name into ctx at (x, y) in device pixels; tex is a canvas or image (the paint).
  function paintName(ctx, x, y, text, px, tex, color, shadows, k) {
    const m = measure(text, px);
    const w = Math.ceil(m.w * k), hh = Math.ceil(m.h * k);
    if (off.width < w || off.height < hh) { off.width = Math.max(off.width, w); off.height = Math.max(off.height, hh); }
    offCtx.globalCompositeOperation = 'source-over';
    offCtx.clearRect(0, 0, off.width, off.height);
    offCtx.fillStyle = color; offCtx.fillRect(0, 0, w, hh);
    if (tex) { offCtx.imageSmoothingEnabled = true; offCtx.imageSmoothingQuality = 'high'; offCtx.drawImage(tex, 0, 0, w, hh); }
    offCtx.globalCompositeOperation = 'destination-in';
    offCtx.font = `700 ${px * k}px ${NAME_FONT}`; offCtx.textBaseline = 'alphabetic'; offCtx.fillStyle = '#000';
    offCtx.fillText(text, 0, m.asc * k);
    offCtx.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.filter = shadowFilter(shadows, k);
    ctx.drawImage(off, 0, 0, w, hh, x, y, w, hh);
    ctx.restore();
    return { w, h: hh };
  }
  // Size a canvas to hold one painted name and draw it.
  function drawNameCanvas(cv, text, px, tex, color, shadows) {
    const k = devicePixelRatio || 1, m = measure(text, px), pad = shadowPad(shadows);
    const cw = Math.ceil((m.w + pad * 2) * k), ch = Math.ceil((m.h + pad * 2) * k);
    if (cv.width !== cw || cv.height !== ch) { cv.width = cw; cv.height = ch; cv.style.width = cw / k + 'px'; cv.style.height = ch / k + 'px'; cv.style.margin = `${-pad}px`; }
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, cw, ch);
    paintName(ctx, Math.round(pad * k), Math.round(pad * k), text, px, tex, color, shadows, k);
  }

  Object.assign(A, { measure, shadowPad, paintName, drawNameCanvas });
})(window.PL);
