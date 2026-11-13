/* cyex paints: editor wiring for static (7TV gradient) and animated (layered, exported as image) paints.
   main.js: header, keyboard shortcuts, focus restore, rendering and boot. Loads last, after every js/app/ module has registered on PL.App. */
(function (PL) {
  'use strict';
  const { h, icon, seg, toast } = PL.UI;
  const A = (PL.App = PL.App || {});
  const $ = A.$; // store.js loads first

  // =====================================================================================
  // Header
  // =====================================================================================
  const modeSeg = seg([['static', 'Static'], ['anim', 'Animated']], A.state.mode, (m) => { A.state.mode = m; renderAll(); A.commit(); }, 'Paint type');
  $('#modeSeg').replaceWith(Object.assign(modeSeg, { id: 'modeSeg' }));
  $('#undoBtn').append(icon('undo')); $('#undoBtn').onclick = A.undo;
  $('#redoBtn').append(icon('redo')); $('#redoBtn').onclick = A.redo;
  const ico = A.ico || icon; // mypaints.js adds the history and pencil icons

  // History: a button next to Undo/Redo that lists every step, newest first.
  const historyBtn = h('button', { type: 'button', class: 'btn secondary small', id: 'historyBtn', 'aria-label': 'Undo history', 'data-tip': 'History', 'data-hint': 'Jump to any earlier step', 'aria-haspopup': 'listbox', 'aria-expanded': 'false' }, ico('history'));
  $('#redoBtn').after(historyBtn);
  function openHistory() {
    const steps = A.history();
    let kb = Math.max(0, steps.findIndex((x) => x.current));
    let pop = null;
    const choose = (i) => {
      const step = steps[i];
      PL.UI.closePop();
      if (step && !step.current) A.jumpTo(step.index);
      historyBtn.focus();
    };
    const items = steps.map((step, i) => h('button', { type: 'button', class: 'option hist', role: 'option', tabindex: '-1', 'aria-selected': String(step.current), 'aria-label': `${step.label}, ${A.fmtTime(step.time)}${step.current ? ', current' : ''}`, onclick: () => choose(i) },
      h('span', { class: 'hmark' }, step.current ? icon('check') : null),
      h('span', { class: 'hlabel', title: step.label }, step.label),
      h('time', { class: 'htime', title: A.fmtDate(step.time) }, A.fmtTime(step.time))));
    const mark = () => {
      items.forEach((b, i) => b.classList.toggle('kb', i === kb));
      if (items[kb]) pop.setAttribute('aria-activedescendant', items[kb].id);
    };
    pop = PL.UI.popover(historyBtn, items, {
      label: 'Undo history',
      onKey: (e) => {
        if (e.key === 'ArrowDown') kb = Math.min(items.length - 1, kb + 1);
        else if (e.key === 'ArrowUp') kb = Math.max(0, kb - 1);
        else if (e.key === 'Home') kb = 0;
        else if (e.key === 'End') kb = items.length - 1;
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); choose(kb); return; }
        else if (e.key === 'Tab') { PL.UI.closePop(); historyBtn.focus(); return; }
        else return;
        e.preventDefault(); mark(); items[kb].scrollIntoView({ block: 'nearest' });
      },
    });
    pop.classList.add('hist-pop');
    items.forEach((b, i) => { b.id = pop.id + '-o' + i; });
    mark();
    pop.focus({ preventScroll: true });
    items[kb]?.scrollIntoView({ block: 'center' });
  }
  historyBtn.onclick = () => (historyBtn.getAttribute('aria-expanded') === 'true' ? PL.UI.closePop() : openHistory());
  historyBtn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openHistory(); } });

  // My paints: opens the saved-paint library (mypaints.js), placed before Presets.
  if (A.openMyPaints) {
    const myBtn = h('button', { type: 'button', class: 'btn secondary', id: 'myPaintsBtn', 'aria-label': 'My paints', 'data-tip': 'My paints', 'data-hint': 'Ctrl+S saves the open paint' }, icon('folder'), h('span', { class: 'lbl' }, 'My paints'));
    myBtn.onclick = A.openMyPaints;
    $('#presetsBtn').before(myBtn);
  }
  $('#presetsBtn').append(icon('sparkles'), h('span', { class: 'lbl' }, 'Presets'));
  $('#presetsBtn').onclick = A.openPresets;
  const themeBtn = $('#themeBtn');
  const paintTheme = () => { themeBtn.textContent = ''; themeBtn.append(icon(document.documentElement.dataset.theme === 'light' ? 'moon' : 'sun')); };
  themeBtn.onclick = () => {
    const go = () => {
      const light = document.documentElement.dataset.theme !== 'light';
      if (light) document.documentElement.dataset.theme = 'light'; else delete document.documentElement.dataset.theme;
      try { localStorage.setItem('cyexTheme', light ? 'light' : 'dark'); } catch (e) {}
      $('meta[name="theme-color"]').content = light ? '#f3f3f4' : '#1e1f23';
      paintTheme();
    };
    if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) { const vt = document.startViewTransition(go); vt.ready.catch(() => {}); vt.finished.catch(() => {}); } else go(); // a quick second click skips the first transition; that's fine
  };
  paintTheme();

  document.addEventListener('keydown', (e) => {
    // only text entry counts as typing; sliders, checkboxes and colour pickers keep the shortcuts
    const typing = e.target.closest && e.target.closest('input:not([type=range]):not([type=checkbox]):not([type=color]):not([type=file]), textarea, [contenteditable]');
    // Ctrl+S saves to My paints; it always blocks the browser's own Save page dialog
    // while a dialog is open the shortcuts act on nothing behind it
    const dialogOpen = !!document.querySelector('.backdrop');
    const key = (e.key || '').toLowerCase();
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && key === 's') { e.preventDefault(); if (!dialogOpen && A.saveCurrent) A.saveCurrent(false); return; }
    if ((e.ctrlKey || e.metaKey) && key === 'z' && !typing) { if (dialogOpen) return; e.preventDefault(); e.shiftKey ? A.redo() : A.undo(); }
    else if ((e.ctrlKey || e.metaKey) && key === 'y' && !typing) { if (dialogOpen) return; e.preventDefault(); A.redo(); }
    else if (e.key === ' ' && !e.defaultPrevented && A.state.mode === 'anim' && !typing && !e.target.closest('input, select, textarea, label, [role=slider], [role=checkbox], [role=spinbutton], button, [role="radio"], [role="listbox"], .item, .backdrop')) { e.preventDefault(); A.togglePlay(); }
  });

  // =====================================================================================
  // Render
  // =====================================================================================
  // Re-rendering replaces the editor DOM, so remember what had focus and put focus back on the
  // matching control (same row and label), or the row, or its neighbour when the row is gone.
  const labelKey = (el) => (el.getAttribute('aria-label') || el.textContent || '').split(':')[0].trim();
  function focusDescriptor() {
    const a = document.activeElement, root = $('#editor');
    if (!a || !root.contains(a)) return null;
    const row = a.closest('[data-id]');
    const rows = row ? [...row.parentElement.querySelectorAll(':scope > [data-id]')] : [];
    return { id: row?.dataset.id, index: rows.indexOf(row), listLabel: row?.parentElement.getAttribute('aria-label'), isRow: a === row, inSettings: !!a.closest('#settingsPanel'), tag: a.tagName, label: labelKey(a) };
  }
  function restoreFocus(fd) {
    if (!fd) return;
    const root = $('#editor');
    const match = (scope) => [...scope.querySelectorAll('button, input, [tabindex="0"]')].find((el) => el.tagName === fd.tag && labelKey(el) === fd.label);
    let el = null;
    if (fd.id) {
      const row = root.querySelector(`[data-id="${fd.id}"]`);
      if (row) el = fd.isRow ? row : match(row) || row;
      else {
        const list = [...root.querySelectorAll('[aria-label]')].find((x) => x.getAttribute('aria-label') === fd.listLabel);
        const rows = list ? [...list.querySelectorAll(':scope > [data-id]')] : [];
        const nb = rows[Math.min(fd.index, rows.length - 1)];
        el = nb?.querySelector('.name') || list?.closest('.panel')?.querySelector('.body .btn');
      }
    } else el = match(fd.inSettings ? $('#settingsPanel') || root : root);
    if (el) el.focus({ preventScroll: true });
  }
  function focusItem(id) { setTimeout(() => $(`#editor [data-id="${id}"] .name`)?.focus({ preventScroll: true })); }

  function renderEditor() {
    const root = $('#editor');
    const y = scrollY;
    const sy = $('.settings-col')?.scrollTop || 0;
    const fd = focusDescriptor();
    root.textContent = '';
    root.className = 'editor';
    document.querySelector('.layout').classList.toggle('anim', A.state.mode === 'anim');
    PL.UI.closePop();
    if (A.state.mode === 'static') A.renderStaticEditor(root); else A.renderAnimEditor(root);
    scrollTo(0, y);
    const sc = $('.settings-col'); if (sc) sc.scrollTop = sy;
    restoreFocus(fd);
  }
  function renderStage() {
    const root = $('#stage');
    root.textContent = '';
    A.codePre = null; A.outputGetter = null;
    if (A.state.mode === 'static') {
      A.pv = A.previewPanel('static');
      root.append(A.pv.el, A.staticOutput());
      A.updateStaticPreview();
      A.rt.texCv = null;
    } else A.animStage(root);
    A.updateOutput();
  }
  function renderAll() {
    modeSeg.setValue(A.state.mode);
    document.title = (A.state.mode === 'static' ? 'Static paint' : 'Animated paint') + ' - cyex paints';
    renderEditor(); renderStage();
    A.rt.dirty = true;
  }
  Object.assign(A, { focusDescriptor, restoreFocus, focusItem, renderEditor, renderAll });

  A.cacheDocImages(A.state.anim);
  renderAll();
  A.updateUndo();
  if (A.pendingNotice) toast(...A.pendingNotice);
})(window.PL);
