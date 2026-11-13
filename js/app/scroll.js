/* cyex paints: one page scroll. The editor's columns and the preview column are sticky, with no
   scrollbars of their own. A column shorter than the window just sticks under the header; a taller
   one moves with the page until its far end is in view, then holds there, in both directions. */
(function (PL) {
  'use strict';
  const A = (PL.App = PL.App || {});
  const GAP = 16; // px between a column and the header or the window bottom
  const SEL = '.stage, .settings-col, .lists-col';
  const tops = new WeakMap(); // element -> current sticky top in px
  const watched = new WeakSet();
  let lastY = scrollY, queued = false;

  const headerBottom = () => {
    const bar = document.querySelector('.topbar');
    return bar && getComputedStyle(bar).position === 'sticky' ? bar.getBoundingClientRect().bottom : 0;
  };
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => schedule()) : null;

  function update() {
    queued = false;
    const y = scrollY, dy = y - lastY;
    lastY = y;
    const hi = Math.round(headerBottom() + GAP);
    for (const el of document.querySelectorAll(SEL)) {
      if (ro && !watched.has(el)) { ro.observe(el); watched.add(el); }
      if (getComputedStyle(el).position !== 'sticky') { el.style.top = ''; tops.delete(el); continue; }
      const lo = Math.min(hi, Math.round(innerHeight - GAP - el.offsetHeight));
      const t = Math.max(lo, Math.min(hi, (tops.has(el) ? tops.get(el) : hi) - dy));
      tops.set(el, t);
      el.style.top = t + 'px';
    }
  }
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(update); } }
  // A column whose content was swapped (another layer selected) starts again from its top.
  function resetSticky(el) { if (el) tops.delete(el); schedule(); }

  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
  Object.assign(A, { resetSticky, syncSticky: schedule });
})(window.PL);
