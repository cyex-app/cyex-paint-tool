/* cyex paints: the keyframe timeline of the selected layer or effect: a ruler with the playhead,
   one row per animated value with its keys as draggable diamonds, and the easing of the picked key.
   Loads after anim-editor.js (A.kf, A.keysChanged) and before playback.js (A.now, A.seek, A.pause):
   everything on A is used at run time only. */
(function (PL) {
  'use strict';
  const { h, iconBtn, select } = PL.UI;
  const A = (PL.App = PL.App || {});
  const $ = (s, r = document) => r.querySelector(s);

  const GROUP = 'Keyframes';
  // the Keyframes group starts open, until it's closed once
  try { if (localStorage.getItem('cyexPaints.kfClosed') !== '1') PL.UI.openGroups.add(GROUP); } catch (e) { PL.UI.openGroups.add(GROUP); }
  document.addEventListener('click', (e) => {
    const hd = e.target.closest && e.target.closest('.ghead');
    if (!hd || !hd.parentElement.querySelector('#timeline')) return;
    try { localStorage.setItem('cyexPaints.kfClosed', hd.getAttribute('aria-expanded') === 'true' ? '0' : '1'); } catch (_) {}
  });

  let picked = null;   // the key object last clicked or focused: the easing picker edits it
  let tidyTimer = 0;   // keyboard moves re-sort the row once the keys are let go for a moment
  // the diamonds by frame and the ones lit at the playhead, so a frame change only touches keys whose state changes
  let byFrame = new Map(), lit = new Set(), curFrame = -1;
  const NONE = new Set();
  const pct = (t) => t * 100 + '%';
  const easeName = (e) => (A.kf.EASES.find(([k]) => k === e) || A.kf.EASES[0])[1];
  const easeWord = (e) => easeName(e).toLowerCase();
  const frameAt = (el, x) => { const r = el.getBoundingClientRect(), n = A.kf.frames(); return PL.clamp(Math.round(((x - r.left) / (r.width || 1)) * n), 0, n - 1); };
  const pathOf = (item, k) => A.kf.paths(item).find((p) => A.kf.list(item, p).includes(k)) || null;
  // no colons in labels: focus restore matches the part before one
  const KEY_HINT = 'Left and Right move the key one frame, with Shift ten. Alt+Left and Alt+Right go to the previous or next key, Home and End to the first or last. Enter changes the easing, Delete removes it.';

  // polite status inside the timeline: cleared first, so the same message is read again
  let sayTimer = 0;
  function announce(msg) {
    const st = $('#timeline .tl-status'); if (st) st.textContent = '';
    clearTimeout(sayTimer);
    sayTimer = setTimeout(() => { const s = $('#timeline .tl-status'); if (s) s.textContent = msg; }, 60);
  }

  // the status and the key hint live outside the rebuilt body, so a refresh doesn't cut an announcement off
  function timeline(s) {
    const root = h('div', { class: 'tl', id: 'timeline' },
      h('div', { class: 'tl-body' }),
      h('p', { class: 'sr-only tl-status', role: 'status', 'aria-live': 'polite' }),
      h('span', { class: 'sr-only', id: 'tlKeyHint' }, KEY_HINT));
    fill(root, s);
    return root;
  }

  function fill(root, s) {
    const kf = A.kf, { item, kind } = s;
    const { frame, frames: n } = kf.now();
    root.dataset.item = item.id; root.dataset.n = String(n);
    const paths = kf.paths(item);
    if (picked && !pathOf(item, picked)) picked = null;
    byFrame = new Map(); lit = new Set(); curFrame = frame;

    const ruler = h('div', { class: 'tl-lane tl-ruler', role: 'slider', tabindex: '0', 'aria-label': 'Playhead', 'aria-valuemin': '1', 'aria-valuemax': String(n), 'data-tip': 'Playhead', 'data-hint': 'Click or drag to move it. Arrow keys step a frame' });
    const every = n <= 50 ? 1 : n <= 100 ? 2 : n <= 200 ? 5 : 10; // ticks stay at least a few pixels apart
    ruler.style.setProperty('--tick', pct(every / n));
    const marks = [...new Set([0, 0.25, 0.5, 0.75].map((q) => Math.round(q * n)))];
    for (const f of marks) ruler.append(h('span', { class: 'tl-mark', style: { left: pct(f / n) } }, String(f + 1)));
    scrubber(ruler);
    ruler.addEventListener('keydown', (e) => {
      const n2 = A.kf.frames(), f = A.kf.now().frame, big = e.shiftKey ? 10 : 1;
      const to = { ArrowRight: f + big, ArrowUp: f + big, ArrowLeft: f - big, ArrowDown: f - big, PageUp: f + 10, PageDown: f - 10, Home: 0, End: n2 - 1 }[e.key];
      if (to == null) return;
      e.preventDefault();
      A.pause(); A.seek((((to % n2) + n2) % n2) / n2); // wraps: it's a loop
    });

    // one playhead line over every lane, moved with a transform (no per-frame restyle of the rows)
    const ph = h('div', { class: 'tl-ph', 'aria-hidden': 'true', hidden: true });
    root._ph = ph;
    const grid = h('div', { class: 'tl-grid' }, ph,
      h('div', { class: 'tl-row tl-rulerrow' }, h('span', { class: 'tl-name' }, 'Frame'), ruler, h('span', { class: 'tl-gap' })));
    for (const path of paths) grid.append(row(item, kind, path, n));

    root.querySelector('.tl-body').replaceChildren(
      h('div', { class: 'tl-head' }, h('span', { class: 'label' }, 'Playhead'), h('span', { class: 'tl-now' })),
      grid,
      paths.length ? editor(item, kind) : h('p', { class: 'hint' }, 'Nothing is animated yet. Use the diamond next to a slider to add a key at the playhead.'));
    // the line follows the ruler's box, measured when the layout changes rather than every frame
    if (root._ro) root._ro.disconnect();
    root._geo = null; root._ro = null;
    if (window.ResizeObserver) {
      root._ro = new ResizeObserver(() => { root._geo = { x: ruler.offsetLeft, w: ruler.offsetWidth }; placePh(root); });
      root._ro.observe(ruler);
    }
    update(root, frame, n);
  }

  function row(item, kind, path, n) {
    const kf = A.kf, label = kf.label(item, kind, path);
    const lane = h('div', { class: 'tl-lane', role: 'group', 'aria-label': label + ' keys' });
    for (const k of kf.list(item, path)) lane.append(diamond(item, kind, path, k, label, n));
    // roving tabindex: one tab stop per row, the picked key or else the first
    const ds = [...lane.children];
    const cur = ds.find((x) => x._key === picked) || ds[0];
    for (const x of ds) x.tabIndex = x === cur ? 0 : -1;
    scrubber(lane);
    const stop = iconBtn('x', 'Stop animating ' + label, () => {
      kf.clear(item, path);
      if (picked && !pathOf(item, picked)) picked = null;
      A.changed(true); A.keysChanged({ focus: null });
      announce(`${label} is no longer animated`);
    }, { cls: 'sm', attrs: { 'data-hint': 'Keeps the value at the playhead' } });
    return h('div', { class: 'tl-row', 'data-path': path }, h('span', { class: 'tl-name', title: label }, label), lane, stop);
  }
  const rove = (d) => { for (const x of d.parentElement.querySelectorAll('.tl-key')) x.tabIndex = x === d ? 0 : -1; };
  const diamondOf = (k) => [...document.querySelectorAll('#timeline .tl-key')].find((x) => x._key === k) || null;

  // The free frame for a key moved from cur towards f: hops over keys ahead, and at the first or
  // last frame takes the nearest free one before it. Returns cur when there's no room.
  function freeFrame(taken, cur, f, dir, nn) {
    f = PL.clamp(f, 0, nn - 1);
    let g = f;
    while (g >= 0 && g < nn && taken.has(g)) g += dir;
    if (g < 0 || g >= nn) { g = f; while (g !== cur && taken.has(g)) g -= dir; }
    return g;
  }
  // the free frame nearest to f, trying the side the key came from first; -1 when every frame holds a key
  function nearestFree(taken, f, from, nn) {
    const pref = from < f ? -1 : 1;
    for (let dd = 1; dd < nn; dd++) for (const s of [pref, -pref]) { const c = f + s * dd; if (c >= 0 && c < nn && !taken.has(c)) return c; }
    return -1;
  }

  // A key: drag to retime (snaps to frames; dropped on another key it moves to the nearest free frame),
  // click to go to it. Keyboard: see KEY_HINT.
  function diamond(item, kind, path, k, label, n) {
    const kf = A.kf;
    const d = h('button', { type: 'button', class: 'tl-key' + (k === picked ? ' sel' : ''), 'aria-current': k === picked ? 'true' : null, 'aria-describedby': 'tlKeyHint', 'data-hint': 'Drag or use the arrow keys to move it. Enter changes the easing, Delete removes it' }, h('i'));
    d._key = k;
    d.place = () => {
      const f = kf.frameOf(k.t);
      d.style.left = pct(f / kf.frames());
      d.dataset.e = k.e;
      d.setAttribute('aria-label', `${label} key at frame ${f + 1}, ${easeName(k.e)}`);
      d.dataset.tip = `Frame ${f + 1} · ${easeName(k.e)}`;
      if (d._f !== f) {
        if (byFrame.has(d._f)) byFrame.get(d._f).delete(d);
        if (!byFrame.has(f)) byFrame.set(f, new Set());
        byFrame.get(f).add(d); d._f = f;
      }
      const on = f === curFrame;
      d.classList.toggle('now', on); if (on) lit.add(d); else lit.delete(d);
      // the picked key's frame readout follows a move right away
      if (k === picked) { const fr = $('#timeline .tl-frame'); if (fr) fr.textContent = `Frame ${f + 1}`; }
    };
    d.place();
    d.addEventListener('focus', () => { rove(d); pick(item, kind, k); });
    d.addEventListener('click', (e) => { if (e.detail === 0) { A.pause(); A.seek(k.t); } }); // Space; pointer clicks are handled on release
    d.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault(); e.stopPropagation();
      d.focus({ preventScroll: true }); pick(item, kind, k);
      A.pause();
      const lane = d.parentElement, x0 = e.clientX, t0 = k.t;
      let moved = false, ended = false;
      try { d.setPointerCapture(e.pointerId); } catch (_) {}
      const move = (ev) => {
        if (!moved && Math.abs(ev.clientX - x0) < 4) return;
        moved = true; d.classList.add('dragging');
        const f = frameAt(lane, ev.clientX), nn = kf.frames();
        if (f !== kf.frameOf(k.t)) { k.t = f / nn; d.place(); A.seek(k.t); A.changed(false); }
      };
      const end = (cancel) => {
        if (ended) return; ended = true;
        d.removeEventListener('pointermove', move); d.removeEventListener('pointerup', onUp); d.removeEventListener('pointercancel', onCancel); removeEventListener('keydown', onKey, true);
        d.classList.remove('dragging');
        if (!moved) { A.seek(k.t); return; }
        if (cancel) { k.t = t0; A.changed(false); A.keysChanged({ focus: k }); announce('Key move cancelled'); return; }
        const ks = kf.list(item, path); if (!ks) return;
        const nn = kf.frames(), f = kf.frameOf(k.t);
        const taken = new Set(ks.filter((o) => o !== k).map((o) => kf.frameOf(o.t)));
        let msg = '';
        // dropped on another key: never replace it, take the nearest free frame instead
        if (taken.has(f)) {
          const g = nearestFree(taken, f, kf.frameOf(t0), nn);
          if (g < 0) { k.t = t0; msg = `Every frame has a key. ${label} key stays at frame ${kf.frameOf(t0) + 1}`; }
          else { k.t = g / nn; msg = `Frame ${f + 1} already has a key. `; }
        }
        ks.sort((a, b) => a.t - b.t);
        A.seek(k.t); A.changed(true); A.keysChanged({ focus: k });
        if (!msg.startsWith('Every')) msg += `${label} key moved to frame ${kf.frameOf(k.t) + 1}, ${easeWord(k.e)}`;
        announce(msg);
      };
      const onUp = () => end(false), onCancel = () => end(true);
      const onKey = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); end(true); } };
      d.addEventListener('pointermove', move); d.addEventListener('pointerup', onUp); d.addEventListener('pointercancel', onCancel);
      addEventListener('keydown', onKey, true);
    });
    d.addEventListener('keydown', (e) => {
      const ks = kf.list(item, path);
      if (!ks) return;
      const arrow = e.key === 'ArrowLeft' || e.key === 'ArrowRight';
      if ((arrow && e.altKey) || e.key === 'Home' || e.key === 'End') {
        // focus moves along the row, in time order (the DOM order may lag behind a keyboard move)
        e.preventDefault(); e.stopPropagation();
        const i = ks.indexOf(k);
        const to = e.key === 'Home' ? ks[0] : e.key === 'End' ? ks[ks.length - 1] : ks[i + (e.key === 'ArrowRight' ? 1 : -1)];
        const el = to && to !== k && diamondOf(to);
        if (el) el.focus();
      } else if (arrow) {
        e.preventDefault(); e.stopPropagation();
        const nn = kf.frames(), dir = e.key === 'ArrowRight' ? 1 : -1, cur = kf.frameOf(k.t);
        // hop over frames that already hold a key of this value; Shift stops at the first or last frame
        const taken = new Set(ks.filter((x) => x !== k).map((x) => kf.frameOf(x.t)));
        const f = freeFrame(taken, cur, cur + dir * (e.shiftKey ? 10 : 1), dir, nn);
        if (f === cur) return;
        k.t = f / nn; ks.sort((a, b) => a.t - b.t);
        d.place(); A.pause(); A.seek(k.t); A.changed(false); A.refreshKeyUI();
        announce(`${label} key moved to frame ${f + 1}, ${easeWord(k.e)}`);
        clearTimeout(tidyTimer); tidyTimer = setTimeout(() => refreshTimeline(), 600); // DOM order follows time again
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault(); e.stopPropagation();
        removeKey(item, kind, path, k);
      } else if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation();
        const E_ = kf.EASES, i = E_.findIndex(([x]) => x === k.e);
        k.e = E_[(i + 1) % E_.length][0];
        d.place(); pick(item, kind, k, true); A.changed(true);
        announce(`${label} key at frame ${kf.frameOf(k.t) + 1}, ${easeWord(k.e)}`);
      }
    });
    return d;
  }

  function removeKey(item, kind, path, k) {
    const kf = A.kf, ks = kf.list(item, path); if (!ks) return;
    const label = kf.label(item, kind, path), f = kf.frameOf(k.t);
    const i = ks.indexOf(k), next = ks[i + 1] || ks[i - 1] || null;
    kf.remove(item, path, k);
    if (picked === k) picked = next;
    A.changed(true); A.keysChanged({ focus: next });
    announce(next ? `${label} key at frame ${f + 1} deleted` : `${label} key deleted. ${label} is no longer animated`);
  }

  // click or drag on the ruler or an empty spot of a row moves the playhead
  function scrubber(el) {
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.tl-key')) return;
      e.preventDefault();
      if (el.classList.contains('tl-ruler')) el.focus({ preventScroll: true });
      const n = A.kf.frames();
      const go = (ev) => A.seek(frameAt(el, ev.clientX) / n);
      A.pause(); go(e);
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      const up = () => { el.removeEventListener('pointermove', go); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
      el.addEventListener('pointermove', go); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    });
  }

  // the picked key: which value, its frame, its easing (the curve from this key to the next one),
  // previous and next key (dense keys stay reachable), delete
  function editor(item, kind) {
    const box = h('div', { class: 'tl-edit' });
    paintEditor(box, item, kind);
    return box;
  }
  function paintEditor(box, item, kind) {
    const kf = A.kf, k = picked, path = k && pathOf(item, k);
    if (!path) { box.replaceChildren(h('p', { class: 'hint' }, 'Pick a key to change its easing. Drag keys to retime them.')); return; }
    const label = kf.label(item, kind, path), one = kf.list(item, path).length < 2;
    const step = (dir) => () => {
      const ks = kf.list(item, path); if (!ks || ks.length < 2) return;
      const to = ks[(ks.indexOf(k) + dir + ks.length) % ks.length]; // wraps: it's a loop
      picked = to; A.pause(); A.seek(to.t); refreshTimeline(); // focus stays on this button (matched by label)
      announce(`${label} key at frame ${kf.frameOf(to.t) + 1}, ${easeWord(to.e)}`);
    };
    box.replaceChildren(
      h('div', { class: 'tl-sel' }, h('span', { class: 'label' }, label), h('span', { class: 'tl-frame' }, `Frame ${kf.frameOf(k.t) + 1}`)),
      h('div', { class: 'tl-ease' }, select(kf.EASES, k.e, (v) => {
        k.e = v; syncDiamond(k); A.changed(true);
        announce(`${label} key at frame ${kf.frameOf(k.t) + 1}, ${easeWord(v)}`);
      }, 'Easing')),
      h('div', { class: 'tl-nav' },
        iconBtn('chevron', 'Previous key', step(-1), { cls: 'sm tl-prev', attrs: { disabled: one, 'data-hint': 'Alt+Left on a key' } }),
        iconBtn('chevron', 'Next key', step(1), { cls: 'sm tl-next', attrs: { disabled: one, 'data-hint': 'Alt+Right on a key' } })),
      iconBtn('trash', 'Delete key', () => removeKey(item, kind, path, k), { cls: 'sm danger', attrs: { 'data-hint': 'Or Delete on the key' } }),
      h('p', { class: 'hint' }, 'Easing shapes the change from this key to the next one.'));
  }
  function pick(item, kind, k, force) {
    if (picked === k && !force) return;
    picked = k;
    const root = $('#timeline'); if (!root) return;
    for (const d of root.querySelectorAll('.tl-key')) {
      const on = d._key === k;
      d.classList.toggle('sel', on);
      if (on) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
    }
    const box = root.querySelector('.tl-edit');
    if (box && !box.contains(document.activeElement)) paintEditor(box, item, kind);
  }
  function syncDiamond(k) { const d = diamondOf(k); if (d) d.place(); }

  function placePh(root) {
    const ph = root._ph, g = root._geo, n = +root.dataset.n;
    if (!ph || !g || !n) return;
    ph.hidden = false;
    ph.style.transform = `translateX(${g.x + (curFrame / n) * g.w}px)`;
  }

  // playhead, frame readout and the "key at the playhead" marks; cheap, runs on every frame change
  function update(root, f, n) {
    if (+root.dataset.n !== n) { refreshTimeline(); return; } // the loop length changed: rebuild the ruler
    curFrame = f;
    placePh(root);
    const fps = A.state.anim.fps;
    const now = root.querySelector('.tl-now');
    if (now) now.textContent = `${String(f + 1).padStart(String(n).length, '0')} / ${n} · ${PL.fmtNum(f / fps, 2)} s`;
    const ruler = root.querySelector('.tl-ruler');
    if (ruler) { ruler.setAttribute('aria-valuenow', String(f + 1)); ruler.setAttribute('aria-valuetext', `Frame ${f + 1} of ${n}`); }
    const on = byFrame.get(f) || NONE;
    for (const d of lit) if (!on.has(d)) { d.classList.remove('now'); lit.delete(d); }
    for (const d of on) if (!lit.has(d)) { d.classList.add('now'); lit.add(d); }
  }
  document.addEventListener('paint:frame', (e) => { const root = $('#timeline'); if (root && root.isConnected) update(root, e.detail.frame, e.detail.frames); });

  // Rebuild in place, keeping focus: the same key, else the same control, else the ruler.
  // opts.focus: a key object to focus (or null to fall back to the ruler) when focus was in the timeline.
  function refreshTimeline(opts = {}) {
    clearTimeout(tidyTimer);
    const root = $('#timeline'), s = A.findSel && A.findSel();
    if (!root || !s || s.item.id !== root.dataset.item) return;
    const a = document.activeElement, inside = !!(a && root.contains(a));
    const key = 'focus' in opts ? opts.focus : inside ? a._key : undefined;
    const label = inside ? (a.getAttribute('aria-label') || '').split(':')[0] : '';
    fill(root, s);
    const gc = root.closest('.group')?.querySelector('.gcount');
    if (gc) gc.textContent = String(A.kf.paths(s.item).length || '');
    if (!inside) return;
    const el = (key && [...root.querySelectorAll('.tl-key')].find((x) => x._key === key))
      || (!a._key && label && [...root.querySelectorAll('button:not(:disabled), [tabindex="0"]')].find((x) => (x.getAttribute('aria-label') || '').split(':')[0] === label))
      || root.querySelector('.tl-ruler');
    el.focus({ preventScroll: true });
  }

  Object.assign(A, { timeline, refreshTimeline });
})(window.PL);
