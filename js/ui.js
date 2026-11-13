/* Small DOM toolkit in the cyex app style: elements, icons, controls, popovers, dialogs, toasts, tooltips. */
(function (PL) {
  'use strict';

  function h(tag, props, ...kids) {
    const el = tag instanceof Element ? tag : document.createElement(tag);
    if (props) for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k in el && typeof v !== 'string') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return el;
  }

  // Lucide paths (ISC licence), stroke 1.8.
  const ICONS = {
    plus: '<path d="M5 12h14M12 5v14"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M9.9 4.2A10 10 0 0 1 12 4c6.5 0 10 8 10 8a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6M2 2l20 20M14.1 14.1a3 3 0 0 1-4.2-4.2"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    dup: '<rect x="8" y="8" width="14" height="14" rx="2"/><path d="M4 16a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M6.3 17.7l-1.4 1.4M19.1 4.9l-1.4 1.4"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>',
    play: '<path d="m6 3 14 9-14 9V3z"/>',
    pause: '<rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7l10-5z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    wand: '<path d="m15 4-1 1M19 8l-1 1M15 9 4 20M19 3v4M17 5h4M8 2v2M7 3h2M21 13v2M20 14h2"/>',
    sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z"/><path d="M19 15v4M17 17h4"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
    redo: '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 15-6.7L21 13"/>',
    swap: '<path d="M8 3 4 7l4 4M4 7h16M16 21l4-4-4-4M20 17H4"/>',
    spread: '<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
    code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
    film: '<rect x="2" y="2" width="20" height="20" rx="2"/><path d="M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5"/>',
    save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
    folder: '<path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9l-.8-1.2A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>',
    reset: '<path d="M3 12a9 9 0 1 0 9-9 9.7 9.7 0 0 0-6.7 2.8L3 8"/><path d="M3 3v5h5"/>',
    fx: '<path d="M4 20h4l10-16h2M7 11h7M15 14l5 6M20 14l-5 6"/>',
    collapse: '<path d="m7 20 5-5 5 5M7 4l5 5 5-5"/>',
    expand: '<path d="m7 15 5 5 5-5M7 9l5-5 5 5"/>',
    dice: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.2"/><circle cx="15.5" cy="15.5" r="1.2"/><circle cx="15.5" cy="8.5" r="1.2"/><circle cx="8.5" cy="15.5" r="1.2"/>',
    move: '<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>',
  };
  function icon(name) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
    s.setAttribute('stroke-width', '1.8'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round'); s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name] || '';
    return s;
  }
  const iconBtn = (name, label, onclick, extra = {}) => h('button', Object.assign({ type: 'button', class: 'icon-btn' + (extra.cls ? ' ' + extra.cls : ''), 'aria-label': label, 'data-tip': label, onclick }, extra.attrs || {}), icon(name));
  const btn = (label, onclick, cls = 'secondary', ic) => h('button', { type: 'button', class: 'btn ' + cls, onclick }, ic ? icon(ic) : null, label);

  // Every panel collapses from its header; the choice is remembered per panel key.
  const PANELS_KEY = 'cyexPaints.collapsed';
  let collapsedPanels = new Set();
  try { collapsedPanels = new Set(JSON.parse(localStorage.getItem(PANELS_KEY) || '[]')); } catch (e) {}
  const savePanels = () => { try { localStorage.setItem(PANELS_KEY, JSON.stringify([...collapsedPanels])); } catch (e) {} };
  function panel(title, body, tools = [], extra = {}) {
    const key = extra.key || title;
    const bodyEl = h('div', { class: 'body' }, body);
    const sec = h('section', { class: 'panel', id: extra.id || null });
    const setOpen = (open) => {
      bodyEl.hidden = !open;
      sec.classList.toggle('collapsed', !open);
      tog.setAttribute('aria-expanded', String(open));
      if (open) collapsedPanels.delete(key); else collapsedPanels.add(key);
      savePanels();
    };
    const tog = h('button', { type: 'button', class: 'ptoggle', 'aria-expanded': 'true', onclick: () => setOpen(bodyEl.hidden) }, icon('chevron'), h('span', null, title));
    if (collapsedPanels.has(key)) { bodyEl.hidden = true; sec.classList.add('collapsed'); tog.setAttribute('aria-expanded', 'false'); }
    sec.append(h('header', null, h('h2', null, tog), extra.count != null ? h('span', { class: 'count' }, extra.count) : null, ...tools), bodyEl);
    return sec;
  }

  // ---- range with number field ----
  function setFill(r) { const min = +r.min, max = +r.max; r.style.setProperty('--p', ((+r.value - min) / (max - min || 1)) * 100 + '%'); }
  function slider(label, value, opts) {
    const { min = 0, max = 1, step = 0.01, onInput, onCommit, unit = '', hint, scale = 1, decimals } = opts;
    const dec = decimals ?? (step * scale >= 1 ? 0 : step * scale >= 0.1 ? 1 : 2);
    const fmt = (v) => (+v * scale).toFixed(dec).replace('.', ','); // cyex format: decimal comma
    const range = h('input', { type: 'range', min, max, step, value, 'aria-label': label });
    const num = h('input', { type: 'text', inputmode: 'decimal', class: 'num', value: fmt(value), 'aria-label': label + (unit ? ' (' + unit + ')' : '') });
    setFill(range);
    const apply = (v, commit) => {
      v = Math.min(max, Math.max(min, v));
      range.value = v; setFill(range);
      if (document.activeElement !== num) num.value = fmt(v);
      onInput && onInput(+range.value);
      if (commit && onCommit) onCommit(+range.value);
    };
    const vt = () => range.setAttribute('aria-valuetext', fmt(range.value) + (unit ? ' ' + unit : ''));
    vt();
    range.addEventListener('input', () => { num.value = fmt(range.value); setFill(range); vt(); onInput && onInput(+range.value); });
    range.addEventListener('change', () => onCommit && onCommit(+range.value));
    num.addEventListener('change', () => { const v = parseFloat(num.value.replace(',', '.')); if (Number.isFinite(v)) apply(v / scale, true); num.value = fmt(range.value); });
    num.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const d = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
      apply(+range.value + d, true); num.value = fmt(range.value);
    });
    const el = h('div', { class: 'ctl' }, h('div', { class: 'top' }, h('span', { class: 'label', title: hint || null }, label), num, unit ? h('span', { class: 'unit' }, unit) : null), range);
    el.set = (v) => { range.value = v; setFill(range); num.value = fmt(v); vt(); };
    return el;
  }

  function seg(options, value, onChange, label) {
    const el = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label || null });
    const render = () => {
      el.textContent = '';
      options.forEach(([v, l]) => {
        const b = h('button', { type: 'button', role: 'radio', 'aria-checked': String(v === value), tabindex: v === value ? '0' : '-1', onclick: () => pick(v) }, l);
        el.append(b);
      });
    };
    const pick = (v) => { if (v === value) return; value = v; render(); onChange(v); el.querySelector('[aria-checked="true"]')?.focus(); };
    el.addEventListener('keydown', (e) => {
      const i = options.findIndex(([v]) => v === value);
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); pick(options[(i + 1) % options.length][0]); }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); pick(options[(i - 1 + options.length) % options.length][0]); }
      if (e.key === 'Home') { e.preventDefault(); pick(options[0][0]); }
      if (e.key === 'End') { e.preventDefault(); pick(options[options.length - 1][0]); }
    });
    render();
    el.setValue = (v) => { value = v; render(); };
    return el;
  }

  function checkbox(label, checked, onChange) {
    const input = h('input', { type: 'checkbox', checked, onchange: () => onChange(input.checked) });
    return h('label', { class: 'check' }, input, h('span', { class: 'box' }, icon('check')), h('span', null, label));
  }
  const labeled = (label, control) => h('div', { class: 'ctl' }, h('div', { class: 'top' }, h('span', { class: 'label' }, label)), control);

  // ---- popover + select ----
  let openPop = null, popSeq = 0;
  function closePop() { if (openPop) { openPop.el.remove(); document.removeEventListener('pointerdown', openPop.out, true); openPop.anchor?.setAttribute('aria-expanded', 'false'); const a = openPop.anchor; openPop = null; return a; } }
  function popover(anchor, content, { onKey, label } = {}) {
    closePop();
    const id = 'pop' + ++popSeq;
    const el = h('div', { class: 'popover', role: 'listbox', tabindex: '-1', id, 'aria-label': label || anchor.getAttribute('aria-label') || anchor.textContent.trim() });
    el.append(...[content].flat());
    anchor.setAttribute('aria-controls', id);
    document.body.append(el);
    const r = anchor.getBoundingClientRect(), ph = el.offsetHeight, pw = Math.max(r.width, el.offsetWidth);
    let top = r.bottom + 6;
    if (top + ph > innerHeight - 8 && r.top - ph - 6 > 8) { top = r.top - ph - 6; el.style.transformOrigin = 'bottom'; el.classList.add('up'); }
    el.style.top = Math.max(8, Math.min(top, innerHeight - ph - 8)) + 'px';
    el.style.left = Math.max(8, Math.min(r.left, innerWidth - pw - 8)) + 'px';
    el.style.minWidth = r.width + 'px';
    const out = (e) => { if (!el.contains(e.target) && !anchor.contains(e.target)) closePop(); };
    document.addEventListener('pointerdown', out, true);
    el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closePop()?.focus(); } else onKey && onKey(e); });
    anchor.setAttribute('aria-expanded', 'true');
    openPop = { el, out, anchor };
    return el;
  }
  addEventListener('resize', () => closePop());
  // A popover never detaches from its anchor: close it when the page (not the list) scrolls.
  addEventListener('scroll', (e) => { if (openPop && !openPop.el.contains(e.target)) closePop(); }, true);

  // Shared listbox keyboard: arrows, Home/End, type-ahead, Enter/Space picks, Tab returns to the trigger.
  function listboxKeys(items, getKb, setKb, choose, trigger, listEl) {
    let typed = '', typedAt = 0;
    items.forEach((b, i) => { b.id = b.id || listEl.id + '-o' + i; });
    const mark = () => { const kb = getKb(); items.forEach((b, i) => b.classList.toggle('kb', i === kb)); if (items[kb]) listEl.setAttribute('aria-activedescendant', items[kb].id); };
    mark();
    return {
      mark,
      onKey(e) {
        let kb = getKb();
        if (e.key === 'ArrowDown') kb = Math.min(items.length - 1, kb + 1);
        else if (e.key === 'ArrowUp') kb = Math.max(0, kb - 1);
        else if (e.key === 'Home') kb = 0; else if (e.key === 'End') kb = items.length - 1;
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); return choose(kb); }
        else if (e.key === 'Tab') { trigger.focus(); closePop(); return; }
        else if (e.key.length === 1) {
          const now = Date.now(); typed = now - typedAt > 700 ? e.key : typed + e.key; typedAt = now;
          const j = items.findIndex((b) => b.textContent.trim().toLowerCase().startsWith(typed.toLowerCase())); if (j >= 0) kb = j;
        } else return;
        e.preventDefault(); setKb(kb); mark(); items[kb].scrollIntoView({ block: 'nearest' });
      },
    };
  }

  function select(options, value, onChange, label) {
    const cur = () => (options.find(([v]) => v === value) || options[0])[1];
    const txt = h('span', null, cur());
    const trigger = h('button', { type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': label ? label + ': ' + cur() : null }, txt, icon('chevron'));
    const open = () => {
      let kb = Math.max(0, options.findIndex(([v]) => v === value));
      const items = options.map(([v, l], i) => h('button', { type: 'button', class: 'option', role: 'option', 'aria-selected': String(v === value), tabindex: '-1', onclick: () => choose(i) }, l));
      const choose = (i) => { value = options[i][0]; txt.textContent = cur(); trigger.setAttribute('aria-label', label ? label + ': ' + cur() : ''); closePop(); trigger.focus(); onChange(value); };
      let keys = null;
      const pop = popover(trigger, items, { label, onKey: (e) => keys.onKey(e) });
      keys = listboxKeys(items, () => kb, (k) => { kb = k; }, choose, trigger, pop);
      pop.focus({ preventScroll: true });
      items[kb]?.scrollIntoView({ block: 'center' });
    };
    trigger.addEventListener('click', () => (openPop && openPop.anchor === trigger ? closePop() : open()));
    trigger.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); } });
    return h('div', { class: 'select' }, trigger);
  }

  // ---- colour field: swatch (native picker), hex text, optional alpha ----
  function colorField(hex, alpha, onChange, opts = {}) {
    const fill = h('i');
    const picker = h('input', { type: 'color', value: hex, 'aria-label': (opts.label || 'Colour') + ' picker' });
    const hexIn = h('input', { type: 'text', class: 'field hex', value: hex, maxlength: 9, spellcheck: false, 'aria-label': (opts.label || 'Colour') + ' hex' });
    const paint = () => { fill.style.background = alpha == null ? hex : `rgba(${PL.hexToRgb(hex).join(',')},${alpha})`; };
    const emit = (commit) => { paint(); onChange(hex, alpha, commit); };
    picker.addEventListener('input', () => { hex = picker.value; hexIn.value = hex; emit(false); });
    picker.addEventListener('change', () => emit(true));
    hexIn.addEventListener('change', () => {
      let v = hexIn.value.trim().replace('#', '');
      if (/^[0-9a-f]{3}$/i.test(v)) v = v.split('').map((c) => c + c).join('');
      if (/^[0-9a-f]{8}$/i.test(v) && alpha != null) { alpha = parseInt(v.slice(6), 16) / 255; v = v.slice(0, 6); aIn && aIn.set(alpha); }
      if (/^[0-9a-f]{4}$/i.test(v)) v = v.slice(0, 3).split('').map((c) => c + c).join('');
      const ok = /^[0-9a-f]{6}$/i.test(v);
      hexIn.setAttribute('aria-invalid', String(!ok));
      if (ok) { hex = '#' + v.toLowerCase(); picker.value = hex; emit(true); }
      hexIn.value = hex;
    });
    let aIn = null;
    const parts = [h('label', { class: 'swatch' }, fill, picker), hexIn];
    if (alpha != null && !opts.noAlpha) {
      aIn = slider('Opacity', alpha, { min: 0, max: 1, step: 0.01, scale: 100, unit: '%', decimals: 0, onInput: (v) => { alpha = v; emit(false); }, onCommit: () => emit(true) });
      aIn.classList.add('grow');
      parts.push(aIn);
    }
    paint();
    return h('div', { class: 'color' }, parts);
  }

  // ---- gradient stops editor (stops: [{ at, color, a }]) ----
  function stopsEditor(stops, onChange, opts = {}) {
    let sel = opts.selected ?? 0;
    const root = h('div', { class: 'stops' });
    const cssOf = () => {
      const s = PL.normStops(stops);
      return 'linear-gradient(90deg, ' + s.map((x) => `rgba(${x.rgb.join(',')},${x.a}) ${(x.at * 100).toFixed(2)}%`).join(', ') + ')';
    };
    const fillEl = h('div', { class: 'fill' });
    const bar = h('div', { class: 'gbar', 'data-tip': 'Click to add a stop', 'data-hint': 'Drag the handles to move them' }, fillEl);
    const list = h('div', { class: 'stoplist' });
    const emit = (commit) => { fillEl.style.background = cssOf(); onChange(stops, commit); };
    const sampleAt = (t) => { const o = [0, 0, 0, 0]; PL.sampleStops(PL.normStops(stops), t, o); return { color: PL.rgbToHex(o[0] * 255, o[1] * 255, o[2] * 255), a: +o[3].toFixed(3) }; };

    function renderHandles() {
      bar.querySelectorAll('.handle').forEach((x) => x.remove());
      stops.forEach((s, i) => {
        const hd = h('button', { type: 'button', class: 'handle' + (i === sel ? ' sel' : ''), style: { left: s.at * 100 + '%', background: `rgba(${PL.hexToRgb(s.color).join(',')},${s.a})` }, 'aria-label': `Stop ${i + 1} at ${Math.round(s.at * 100)}%` });
        hd.addEventListener('pointerdown', (e) => {
          e.stopPropagation(); e.preventDefault();
          sel = i; markSel(); hd.focus({ preventScroll: true });
          const me = hd;
          try { me.setPointerCapture(e.pointerId); } catch (_) {}
          const r = bar.getBoundingClientRect();
          const move = (ev) => { stops[i].at = Math.round(PL.clamp((ev.clientX - r.left) / r.width) * 1000) / 1000; me.style.left = stops[i].at * 100 + '%'; const row = list.children[i]; row && row.posCtl && row.posCtl(stops[i].at); emit(false); };
          const up = () => {
            me.removeEventListener('pointermove', move); me.removeEventListener('pointerup', up); me.removeEventListener('pointercancel', up);
            const cur = stops[i]; stops.sort((a, b) => a.at - b.at); sel = stops.indexOf(cur); renderAll(); emit(true);
          };
          me.addEventListener('pointermove', move); me.addEventListener('pointerup', up); me.addEventListener('pointercancel', up);
        });
        hd.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); stops[i].at = Math.round(PL.clamp(stops[i].at + (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 0.1 : 0.01)) * 1000) / 1000; sel = i; renderHandles(); renderList(); emit(true); bar.querySelectorAll('.handle')[i].focus(); }
          if ((e.key === 'Delete' || e.key === 'Backspace') && stops.length > 1) { e.preventDefault(); remove(i); }
        });
        bar.append(hd);
      });
    }
    bar.addEventListener('pointerdown', (e) => {
      if (e.target.classList.contains('handle')) return;
      const r = bar.getBoundingClientRect(), at = Math.round(PL.clamp((e.clientX - r.left) / r.width) * 1000) / 1000;
      const c = sampleAt(at);
      stops.push({ at, color: c.color, a: c.a });
      stops.sort((a, b) => a.at - b.at);
      sel = stops.findIndex((s) => s.at === at);
      renderAll(); emit(true);
    });
    function remove(i) { stops.splice(i, 1); sel = Math.min(sel, stops.length - 1); renderAll(); emit(true); }
    function renderList() {
      list.textContent = '';
      stops.forEach((s, i) => {
        const pos = h('input', { type: 'text', inputmode: 'decimal', class: 'num', value: PL.fmtNum(s.at * 100, 1), 'aria-label': `Stop ${i + 1} position (%)` });
        pos.addEventListener('change', () => { const v = parseFloat(pos.value.replace(',', '.')); if (Number.isFinite(v)) { s.at = PL.clamp(v / 100); renderHandles(); emit(true); } pos.value = PL.fmtNum(s.at * 100, 1); });
        pos.addEventListener('focus', () => { sel = i; markSel(); });
        const al = h('input', { type: 'text', inputmode: 'decimal', class: 'num', value: Math.round(s.a * 100), 'aria-label': `Stop ${i + 1} opacity (%)` });
        al.addEventListener('change', () => { const v = parseFloat(al.value.replace(',', '.')); if (Number.isFinite(v)) { s.a = PL.clamp(v / 100); renderHandles(); colorBox.repaint(); emit(true); } al.value = Math.round(s.a * 100); });
        const colorBox = colorField(s.color, null, (hex, a, commit) => { s.color = hex; renderHandles(); emit(commit); }, { label: `Stop ${i + 1}` });
        colorBox.repaint = () => {};
        const row = h('div', { class: 'stoprow' + (i === sel ? ' sel' : ''), onpointerdown: () => { if (sel !== i) { sel = i; markSel(); } } },
          h('span', { class: 'idx' }, String(i + 1).padStart(2, '0')),
          colorBox, h('span'),
          h('span', { class: 'numwrap', 'data-tip': 'Position' }, pos, h('span', { class: 'unit' }, '%')),
          h('span', { class: 'numwrap alpha', 'data-tip': 'Opacity' }, al, h('span', { class: 'unit' }, 'α')),
          iconBtn('trash', `Remove stop ${i + 1}`, () => remove(i), { cls: 'sm danger', attrs: { disabled: stops.length <= 1 } }));
        row.posCtl = (v) => { pos.value = PL.fmtNum(v * 100, 1); };
        list.append(row);
      });
    }
    function markSel() { [...list.children].forEach((r, i) => r.classList.toggle('sel', i === sel)); bar.querySelectorAll('.handle').forEach((x, i) => x.classList.toggle('sel', i === sel)); }
    function renderAll() { fillEl.style.background = cssOf(); renderHandles(); renderList(); }
    const tools = h('div', { class: 'row' },
      btn('Add stop', () => { const a = stops[sel] || stops[0]; const b = stops[sel + 1]; const at = b ? (a.at + b.at) / 2 : a ? Math.min(1, a.at + 0.1) : 0; const c = sampleAt(at); stops.push({ at: Math.round(at * 1000) / 1000, color: c.color, a: c.a }); stops.sort((x, y) => x.at - y.at); sel = stops.findIndex((s) => s.at === Math.round(at * 1000) / 1000); renderAll(); emit(true); }, 'secondary small', 'plus'),
      btn('Reverse', () => { stops.forEach((s) => (s.at = Math.round((1 - s.at) * 1000) / 1000)); stops.reverse(); renderAll(); emit(true); }, 'ghost small', 'swap'),
      btn('Spread evenly', () => { stops.sort((a, b) => a.at - b.at); stops.forEach((s, i) => (s.at = stops.length > 1 ? Math.round((i / (stops.length - 1)) * 1000) / 1000 : 0)); renderAll(); emit(true); }, 'ghost small', 'spread'),
      opts.palettes ? paletteMenu((pal) => { stops.splice(0, stops.length, ...PL.clone(pal)); sel = 0; renderAll(); emit(true); }) : null);
    root.append(bar, list, tools);
    renderAll();
    return root;
  }
  function paletteMenu(onPick) {
    const b = btn('Palettes', () => {
      const items = Object.entries(PL.PALETTES).map(([k, pal]) => {
        const s = PL.normStops(pal);
        const sw = h('i', { style: { width: '64px', height: '14px', flex: 'none', border: '1px solid var(--border-strong)', background: 'linear-gradient(90deg,' + s.map((x) => `rgba(${x.rgb.join(',')},${x.a}) ${x.at * 100}%`).join(',') + ')' } });
        return h('button', { type: 'button', class: 'option', role: 'option', tabindex: '-1', 'aria-selected': 'false', onclick: () => { closePop(); b.focus(); onPick(pal); } }, sw, k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()));
      });
      let kb = 0, keys = null;
      const pop = popover(b, items, { label: 'Palettes', onKey: (e) => keys.onKey(e) });
      keys = listboxKeys(items, () => kb, (k) => { kb = k; }, (i) => items[i].click(), b, pop);
      pop.focus({ preventScroll: true });
    }, 'ghost small', 'sparkles');
    return b;
  }

  // ---- dialog ----
  function dialog(title, body, { footer, wide, onClose } = {}) {
    const prev = document.activeElement;
    const close = () => { back.remove(); document.removeEventListener('keydown', key, true); onClose && onClose(); prev && prev.focus && prev.focus(); };
    const box = h('div', { class: 'dialog' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('header', null, h('h2', null, title), iconBtn('x', 'Close', () => close())),
      h('div', { class: 'dbody' }, body),
      footer ? h('footer', null, footer) : null);
    const back = h('div', { class: 'backdrop', onpointerdown: (e) => { if (e.target === back) close(); } }, box);
    const key = (e) => {
      // Escape first clears a filled search field, then closes
      if (e.key === 'Escape' && !openPop) {
        const tg = e.target;
        if (tg.matches && tg.matches('.search input') && tg.value) { e.preventDefault(); tg.value = ''; tg.dispatchEvent(new Event('input')); return; }
        e.preventDefault(); close();
      }
      // Enter runs the primary action, except in text areas, lists and on buttons (which act themselves)
      if (e.key === 'Enter' && !e.shiftKey && !openPop && !e.target.closest('textarea, button, [role="listbox"], .card')) {
        const primary = box.querySelector('footer .btn.primary');
        if (primary) { e.preventDefault(); primary.click(); }
      }
      if (e.key === 'Tab') {
        const f = [...box.querySelectorAll('button, input, textarea, [tabindex="0"]')].filter((x) => !x.disabled && x.offsetParent);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    document.addEventListener('keydown', key, true);
    document.body.append(back);
    setTimeout(() => (box.querySelector('[autofocus]') || box.querySelector('.dbody input, .dbody textarea, .dbody button') || box).focus(), 0);
    return { close, box };
  }

  // ---- toasts ----
  // The hosts are aria-live regions, so toasts carry no role of their own (no double announcements).
  // A repeat of the same message bumps a ×N count instead of stacking; hover or focus holds a toast.
  function toast(msg, kind = 'info') {
    const host = document.getElementById(kind === 'error' ? 'errors' : 'toasts');
    const life = kind === 'error' ? 9000 : 3500;
    const same = [...host.children].find((x) => x.dataset.msg === msg);
    if (same) { same.bump(); return; }
    const text = h('span', null, msg), count = h('b', { class: 'tcount' });
    const drain = kind === 'error' ? null : h('i', { class: 'drain' });
    const t = h('div', { class: 'toast ' + kind, 'data-msg': msg }, text, count, iconBtn('x', 'Dismiss', () => t.remove(), { cls: 'sm x' }), drain);
    let n = 1, timer = 0, held = false;
    const start = (ms) => {
      clearTimeout(timer); timer = setTimeout(() => t.remove(), ms);
      if (drain) { drain.style.animation = 'none'; void drain.offsetWidth; drain.style.animation = `drain ${ms}ms linear forwards`; }
    };
    const hold = () => { held = true; clearTimeout(timer); if (drain) drain.style.animationPlayState = 'paused'; };
    const release = () => { if (!held || t.contains(document.activeElement) || t.matches(':hover')) return; held = false; start(2000); };
    t.bump = () => { n++; count.textContent = ' ×' + n; if (!held) start(life); };
    host.append(t);
    while (host.children.length > 3) host.firstChild.remove();
    start(life);
    t.addEventListener('pointerenter', hold); t.addEventListener('focusin', hold);
    t.addEventListener('pointerleave', () => setTimeout(release)); t.addEventListener('focusout', () => setTimeout(release));
  }

  // ---- tooltips (data-tip / data-hint) ----
  (function tips() {
    const tip = document.getElementById('tooltip');
    let timer = 0, lastHide = 0, cur = null;
    const show = (el) => {
      cur = el;
      tip.textContent = el.dataset.tip;
      if (el.dataset.hint) tip.append(h('small', null, el.dataset.hint));
      tip.classList.toggle('instant', Date.now() - lastHide < 400);
      tip.hidden = false;
      const r = el.getBoundingClientRect(), tw = tip.offsetWidth, th = tip.offsetHeight;
      let top = r.bottom + 6; if (top + th > innerHeight - 8) top = r.top - th - 6;
      tip.style.top = top + 'px';
      tip.style.left = Math.max(8, Math.min(r.left + r.width / 2 - tw / 2, innerWidth - tw - 8)) + 'px';
    };
    const hide = () => { clearTimeout(timer); if (!tip.hidden) lastHide = Date.now(); tip.hidden = true; cur = null; };
    const enter = (e) => {
      const el = e.target.closest && e.target.closest('[data-tip]');
      if (!el || el === cur) return;
      hide();
      timer = setTimeout(() => show(el), Date.now() - lastHide < 400 ? 0 : 150);
    };
    document.addEventListener('pointerover', (e) => { if (e.pointerType === 'mouse') enter(e); });
    document.addEventListener('pointerout', (e) => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el && !el.contains(e.relatedTarget)) hide(); });
    document.addEventListener('focusin', (e) => { if (e.target.matches && e.target.matches(':focus-visible') && e.target.dataset && e.target.dataset.tip) { hide(); timer = setTimeout(() => show(e.target), 150); } });
    document.addEventListener('focusout', hide);
    ['scroll', 'resize', 'pointerdown'].forEach((ev) => addEventListener(ev, hide, true));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide(); });
  })();

  // ---- drag to reorder ----
  // Items need the class .sortable-item and a .grip handle. onMove(from, to) gets display indices.
  // Keyboard: focus a grip and press Alt+Up / Alt+Down.
  function sortable(container, onMove) {
    container.addEventListener('pointerdown', (e) => {
      const grip = e.target.closest('.grip');
      if (!grip || !container.contains(grip) || e.button !== 0) return;
      const el = grip.closest('.sortable-item');
      const items = [...container.children].filter((x) => x.classList.contains('sortable-item'));
      const from = items.indexOf(el);
      if (from < 0) return;
      e.preventDefault();
      const rects = items.map((x) => x.getBoundingClientRect());
      const step = items.length > 1 ? rects[1].top - rects[0].top : rects[0].height;
      const startY = e.clientY;
      let to = from;
      el.classList.add('dragging');
      container.classList.add('sorting');
      try { grip.setPointerCapture(e.pointerId); } catch (_) {}
      const move = (ev) => {
        const dy = ev.clientY - startY;
        el.style.transform = `translateY(${dy}px)`;
        const cy = rects[from].top + rects[from].height / 2 + dy;
        to = from;
        for (let i = 0; i < items.length; i++) {
          const mid = rects[i].top + rects[i].height / 2;
          if (i < from && cy < mid) { to = i; break; }
        }
        for (let i = items.length - 1; i > from; i--) { const mid = rects[i].top + rects[i].height / 2; if (cy > mid) { to = i; break; } }
        items.forEach((it, i) => {
          if (it === el) return;
          let s = 0;
          if (from < to && i > from && i <= to) s = -step;
          if (from > to && i >= to && i < from) s = step;
          it.style.transform = s ? `translateY(${s}px)` : '';
        });
      };
      const end = () => {
        grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', end); grip.removeEventListener('pointercancel', end);
        items.forEach((it) => { it.style.transform = ''; });
        el.classList.remove('dragging'); container.classList.remove('sorting');
        if (to !== from) onMove(from, to);
      };
      grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end);
    });
    container.addEventListener('keydown', (e) => {
      const grip = e.target.closest && e.target.closest('.grip');
      if (!grip || !e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
      e.preventDefault();
      const items = [...container.children].filter((x) => x.classList.contains('sortable-item'));
      const from = items.indexOf(grip.closest('.sortable-item')), to = from + (e.key === 'ArrowUp' ? -1 : 1);
      if (to >= 0 && to < items.length) {
        onMove(from, to, true);
        // lists that re-render in place keep the moved item's grip focused, so moves can repeat
        setTimeout(() => { if (container.isConnected) [...container.children].filter((x) => x.classList.contains('sortable-item'))[to]?.querySelector('.grip')?.focus(); });
      }
    });
  }
  const grip = (label) => h('button', { type: 'button', class: 'grip', 'aria-label': label || 'Drag to reorder', 'data-tip': 'Drag to reorder', 'data-hint': 'Or Alt+Up and Alt+Down' }, h('i'), h('i'), h('i'));

  // ---- collapsible group ----
  const GROUPS_KEY = 'cyexPaints.openGroups';
  let openGroups = new Set(['Colours', 'Settings', 'Shape', 'Layer']);
  try { const g = JSON.parse(localStorage.getItem(GROUPS_KEY) || 'null'); if (Array.isArray(g)) openGroups = new Set(g); } catch (e) {}
  const saveGroups = () => { try { localStorage.setItem(GROUPS_KEY, JSON.stringify([...openGroups])); } catch (e) {} };
  function group(title, content, { open, count } = {}) {
    const isOpen = open ?? openGroups.has(title);
    const body = h('div', { class: 'gbody' }, content);
    const head = h('button', { type: 'button', class: 'ghead', 'aria-expanded': String(isOpen), onclick: () => {
      const o = head.getAttribute('aria-expanded') !== 'true';
      head.setAttribute('aria-expanded', String(o)); body.hidden = !o;
      if (o) openGroups.add(title); else openGroups.delete(title);
      saveGroups();
    } }, icon('chevron'), h('span', null, title), count != null ? h('span', { class: 'gcount' }, count) : null);
    body.hidden = !isOpen;
    return h('div', { class: 'group' }, head, body);
  }

  // ---- weighted palette editor ----
  // pal: { colors: [{ c, a, w }], blend, loop }. Strength = weight; the share column shows the result.
  function paletteEditor(pal, onChange, opts = {}) {
    const root = h('div', { class: 'paled' });
    const bar = h('div', { class: 'pbar' }, h('i'));
    const list = h('div', { class: 'plist' });
    const emit = (commit) => { paintBar(); shares(); onChange(pal, commit); };
    const paintBar = () => {
      const st = PL.normStops(PL.paletteToStops(pal));
      bar.firstChild.style.background = 'linear-gradient(90deg,' + st.map((x) => `rgba(${x.rgb.join(',')},${x.a}) ${(x.at * 100).toFixed(2)}%`).join(',') + ')';
    };
    const shareEls = [];
    const shares = () => { const tot = pal.colors.reduce((s, c) => s + c.w, 0) || 1; pal.colors.forEach((c, i) => { if (shareEls[i]) shareEls[i].textContent = Math.round((c.w / tot) * 100) + '%'; }); };
    function render() {
      list.textContent = ''; shareEls.length = 0;
      pal.colors.forEach((col, i) => {
        const share = h('span', { class: 'share', 'data-tip': 'Share of the whole palette' });
        shareEls.push(share);
        const str = h('input', { type: 'range', min: 0, max: 4, step: 0.05, value: col.w, 'aria-label': `Colour ${i + 1} strength` });
        const fill = () => str.style.setProperty('--p', (col.w / 4) * 100 + '%');
        fill();
        str.addEventListener('input', () => { col.w = +str.value; fill(); emit(false); });
        str.addEventListener('change', () => emit(true));
        const al = h('input', { type: 'text', inputmode: 'decimal', class: 'num', value: Math.round((col.a ?? 1) * 100), 'aria-label': `Colour ${i + 1} opacity (%)`, 'data-tip': 'Opacity' });
        al.addEventListener('change', () => { const v = parseFloat(al.value.replace(',', '.')); if (Number.isFinite(v)) col.a = PL.clamp(v / 100); al.value = Math.round(col.a * 100); emit(true); });
        const row = h('div', { class: 'prow sortable-item' },
          grip(`Move colour ${i + 1}`),
          colorField(col.c, null, (hx, a, c) => { col.c = hx; emit(c); }, { label: `Colour ${i + 1}` }),
          share,
          h('span', { class: 'numwrap' }, al, h('span', { class: 'unit' }, '%')),
          iconBtn('trash', `Remove colour ${i + 1}`, () => { pal.colors.splice(i, 1); render(); emit(true); }, { cls: 'sm danger', attrs: { disabled: pal.colors.length <= 1 } }),
          h('div', { class: 'pstr' }, h('span', { class: 'label' }, 'Strength'), str));
        list.append(row);
      });
      shares(); paintBar();
    }
    sortable(list, (from, to) => { const [c] = pal.colors.splice(from, 1); pal.colors.splice(to, 0, c); render(); emit(true); });
    const blend = slider('Smoothness', pal.blend ?? 1, { min: 0, max: 1, step: 0.01, scale: 100, unit: '%', decimals: 0, hint: '0% gives hard bands, 100% smooth blends', onInput: (v) => { pal.blend = v; emit(false); }, onCommit: () => emit(true) });
    const tools = h('div', { class: 'row' },
      btn('Add colour', () => { const last = pal.colors[pal.colors.length - 1]; pal.colors.push({ c: last ? last.c : '#ffffff', a: 1, w: 1 }); render(); emit(true); }, 'secondary small', 'plus'),
      btn('Even out', () => { pal.colors.forEach((c) => (c.w = 1)); render(); emit(true); }, 'ghost small', 'spread'),
      btn('Reverse', () => { pal.colors.reverse(); render(); emit(true); }, 'ghost small', 'swap'),
      paletteMenu((stops) => { const np = PL.stopsToPalette(stops, pal.loop); pal.colors = np.colors; render(); emit(true); }));
    root.append(bar, list, tools, h('div', { class: 'split' }, blend, h('div', { class: 'ctl', style: { justifyContent: 'flex-end' } }, checkbox('Loop back to the first colour', !!pal.loop, (v) => { pal.loop = v; emit(true); }))));
    render();
    return root;
  }

  function download(blob, name) {
    if (!blob) { toast('Couldn’t create that file. It may be too large for the browser.', 'error'); return; }
    const a = h('a', { href: URL.createObjectURL(blob), download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
      document.body.append(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
      ta.remove(); return ok;
    }
  }
  const slug = (s) => (String(s || 'paint').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'paint');

  PL.UI = { h, icon, iconBtn, btn, panel, slider, seg, checkbox, labeled, select, popover, closePop, colorField, stopsEditor, paletteMenu, paletteEditor, sortable, grip, group, openGroups, dialog, toast, download, copyText, slug };
})(window.PL);
