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
  const pct = (t) => t * 100 + '%';
  const easeName = (e) => (A.kf.EASES.find(([k]) => k === e) || A.kf.EASES[0])[1];
  const frameAt = (el, x) => { const r = el.getBoundingClientRect(), n = A.kf.frames(); return PL.clamp(Math.round(((x - r.left) / (r.width || 1)) * n), 0, n - 1); };
  const pathOf = (item, k) => A.kf.paths(item).find((p) => A.kf.list(item, p).includes(k)) || null;

  function timeline(s) {
    const root = h('div', { class: 'tl', id: 'timeline' });
    fill(root, s);
    return root;
  }

  function fill(root, s) {
    const kf = A.kf, { item, kind } = s;
    const { frame, frames: n } = kf.now();
    root.dataset.item = item.id; root.dataset.n = String(n);
    const paths = kf.paths(item);
    if (picked && !pathOf(item, picked)) picked = null;

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

    const grid = h('div', { class: 'tl-grid' },
      h('div', { class: 'tl-row tl-rulerrow' }, h('span', { class: 'tl-name' }, 'Frame'), ruler, h('span', { class: 'tl-gap' })));
    for (const path of paths) grid.append(row(item, kind, path, n));

    root.replaceChildren(
      h('div', { class: 'tl-head' }, h('span', { class: 'label' }, 'Playhead'), h('span', { class: 'tl-now' })),
      grid,
      paths.length ? editor(item, kind) : h('p', { class: 'hint' }, 'Nothing is animated yet. Use the diamond next to a slider to add a key at the playhead.'));
    update(root, frame, n);
  }

  function row(item, kind, path, n) {
    const kf = A.kf, label = kf.label(item, kind, path);
    const lane = h('div', { class: 'tl-lane', role: 'group', 'aria-label': label + ' keys' });
    for (const k of kf.list(item, path)) lane.append(diamond(item, kind, path, k, label, n));
    scrubber(lane);
    const stop = iconBtn('x', 'Stop animating ' + label, () => {
      kf.clear(item, path);
      if (picked && !pathOf(item, picked)) picked = null;
      A.changed(true); A.keysChanged({ focus: null });
    }, { cls: 'sm', attrs: { 'data-hint': 'Keeps the value at the playhead' } });
    return h('div', { class: 'tl-row', 'data-path': path }, h('span', { class: 'tl-name', title: label }, label), lane, stop);
  }

  // A key: drag to retime (snaps to frames, dropping on another key replaces it), click to go to it.
  // Keyboard: ArrowLeft/Right one frame (Shift: 10), Enter cycles the easing, Delete removes.
  function diamond(item, kind, path, k, label, n) {
    const kf = A.kf;
    const d = h('button', { type: 'button', class: 'tl-key' + (k === picked ? ' sel' : ''), 'data-hint': 'Drag or use the arrow keys to move it. Enter changes the easing, Delete removes it' }, h('i'));
    d._key = k;
    d.place = () => {
      const f = kf.frameOf(k.t);
      d.style.left = pct(f / kf.frames());
      d.dataset.e = k.e;
      d.setAttribute('aria-label', `${label} key at frame ${f + 1}, ${easeName(k.e)}`);
      d.dataset.tip = `Frame ${f + 1} · ${easeName(k.e)}`;
    };
    d.place();
    d.addEventListener('focus', () => pick(item, kind, k));
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
        if (cancel) { k.t = t0; A.changed(false); A.keysChanged({ focus: k }); return; }
        const ks = kf.list(item, path); if (!ks) return;
        const f = kf.frameOf(k.t);
        for (const o of ks.slice()) if (o !== k && kf.frameOf(o.t) === f) ks.splice(ks.indexOf(o), 1);
        ks.sort((a, b) => a.t - b.t);
        A.changed(true); A.keysChanged({ focus: k });
      };
      const onUp = () => end(false), onCancel = () => end(true);
      const onKey = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); end(true); } };
      d.addEventListener('pointermove', move); d.addEventListener('pointerup', onUp); d.addEventListener('pointercancel', onCancel);
      addEventListener('keydown', onKey, true);
    });
    d.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault(); e.stopPropagation();
        const ks = kf.list(item, path), nn = kf.frames(), dir = e.key === 'ArrowRight' ? 1 : -1;
        if (!ks) return;
        // hop over frames that already hold a key of this value
        const taken = new Set(ks.filter((x) => x !== k).map((x) => kf.frameOf(x.t)));
        let f = kf.frameOf(k.t) + dir * (e.shiftKey ? 10 : 1);
        while (f >= 0 && f < nn && taken.has(f)) f += dir;
        if (f < 0 || f >= nn) return;
        k.t = f / nn; ks.sort((a, b) => a.t - b.t);
        d.place(); A.pause(); A.seek(k.t); A.changed(false); A.refreshKeyUI();
        clearTimeout(tidyTimer); tidyTimer = setTimeout(() => refreshTimeline(), 600); // DOM order follows time again
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault(); e.stopPropagation();
        removeKey(item, path, k);
      } else if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation();
        const E_ = kf.EASES, i = E_.findIndex(([x]) => x === k.e);
        k.e = E_[(i + 1) % E_.length][0];
        d.place(); pick(item, kind, k, true); A.changed(true);
      }
    });
    return d;
  }

  function removeKey(item, path, k) {
    const ks = A.kf.list(item, path); if (!ks) return;
    const i = ks.indexOf(k), next = ks[i + 1] || ks[i - 1] || null;
    A.kf.remove(item, path, k);
    if (picked === k) picked = next;
    A.changed(true); A.keysChanged({ focus: next });
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

  // the picked key: which value, its frame, its easing (the curve from this key to the next one), delete
  function editor(item, kind) {
    const box = h('div', { class: 'tl-edit' });
    paintEditor(box, item, kind);
    return box;
  }
  function paintEditor(box, item, kind) {
    const kf = A.kf, k = picked, path = k && pathOf(item, k);
    if (!path) { box.replaceChildren(h('p', { class: 'hint' }, 'Pick a key to change its easing. Drag keys to retime them.')); return; }
    box.replaceChildren(
      h('div', { class: 'tl-sel' }, h('span', { class: 'label' }, kf.label(item, kind, path)), h('span', { class: 'tl-frame' }, `Frame ${kf.frameOf(k.t) + 1}`)),
      h('div', { class: 'tl-ease' }, select(kf.EASES, k.e, (v) => { k.e = v; syncDiamond(k); A.changed(true); }, 'Easing')),
      iconBtn('trash', 'Delete key', () => removeKey(item, path, k), { cls: 'sm danger', attrs: { 'data-hint': 'Delete key' } }),
      h('p', { class: 'hint' }, 'Easing shapes the change from this key to the next one.'));
  }
  function pick(item, kind, k, force) {
    if (picked === k && !force) return;
    picked = k;
    const root = $('#timeline'); if (!root) return;
    for (const d of root.querySelectorAll('.tl-key')) d.classList.toggle('sel', d._key === k);
    const box = root.querySelector('.tl-edit');
    if (box && !box.contains(document.activeElement)) paintEditor(box, item, kind);
  }
  function syncDiamond(k) {
    const d = [...document.querySelectorAll('#timeline .tl-key')].find((x) => x._key === k);
    if (d) d.place();
  }

  // playhead, frame readout and the "key at the playhead" marks; cheap, runs on every frame change
  function update(root, f, n) {
    if (+root.dataset.n !== n) { refreshTimeline(); return; } // the loop length changed: rebuild the ruler
    root.style.setProperty('--ph', String(f / n));
    const fps = A.state.anim.fps;
    const now = root.querySelector('.tl-now');
    if (now) now.textContent = `${String(f + 1).padStart(String(n).length, '0')} / ${n} · ${PL.fmtNum(f / fps, 2)} s`;
    const ruler = root.querySelector('.tl-ruler');
    if (ruler) { ruler.setAttribute('aria-valuenow', String(f + 1)); ruler.setAttribute('aria-valuetext', `Frame ${f + 1} of ${n}`); }
    for (const d of root.querySelectorAll('.tl-key')) d.classList.toggle('now', A.kf.frameOf(d._key.t) === f);
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
      || (!a._key && label && [...root.querySelectorAll('button, [tabindex="0"]')].find((x) => (x.getAttribute('aria-label') || '').split(':')[0] === label))
      || root.querySelector('.tl-ruler');
    el.focus({ preventScroll: true });
  }

  Object.assign(A, { timeline, refreshTimeline });
})(window.PL);
