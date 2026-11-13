# Findings, pass 2 (browser slices, verified in the pane)

- [MEDIUM] Repeated clicks on Presets (or any dialog opener) stack several dialogs
  Where: header Presets @ 1280, mouse/keyboard
  Repro: click Presets 5 times quickly (or hold Enter on it)
  Expected / actual: one dialog / 5 stacked .dialog elements; Escape closes one at a time
  Evidence: rapidPresetClicks dialogs=5
  Likely cause + fix: js/ui.js dialog(): refuse (or focus the existing one) when a dialog with the same title is open

- [MEDIUM] Big-export confirm dialog opens with nothing focused
  Where: Export GIF at 1024×64, 50 fps, 8 s
  Repro: trigger the "This is a big export" dialog
  Expected / actual: focus on a footer button (Cancel or Export anyway) / document.body
  Likely cause + fix: dialog() initial focus looks only in .dbody for inputs/buttons; fall back to the footer's primary (or first) button

- [MEDIUM] Cancelling an export drops focus to the page
  Where: Export panel Cancel
  Repro: start Export APNG, Tab to Cancel, press Enter
  Expected / actual: focus back on the export button / BODY (Cancel hides itself)
  Likely cause + fix: js/app/export.js runExport finally: if Cancel had focus, focus the started button (b)

- [MEDIUM] Layer names are cut short in the 330 px layer column (e.g. "Shine sweep") at 1440 to 2560 and at 375/390
  Where: Layers list rows
  Expected / actual: names readable / clipped after ~10 characters while thumb, blend meta and 3 icon buttons take the row
  Likely cause + fix: css/app.css .item: show the tools only on row hover/focus-within (keep them reachable), or put the meta under the name; widen the list column to 360 px

- [MEDIUM] Selecting a layer with 60 layers takes ~260 ms (full editor rebuild)
  Where: Layers list, 60 layers
  Expected / actual: under 100 ms feedback / 263 ms; first render 800 ms
  Likely cause + fix: js/app/main.js renderEditor rebuilds everything on selection; update only the selection classes and the settings column on select

- [LOW] Undo button leaves focus on the page when it disables itself
  Where: header Undo, keyboard
  Repro: focus Undo, press Enter until history is empty
  Likely cause + fix: js/app/store.js updateUndo: if the disabled button had focus, move focus to Redo (or use aria-disabled)

## Passed in pass 2
- No horizontal scroll at 320, 375, 390, 430, 640×400, 768, 844×390, 1024, 1280, 1440, 1920, 2560; dark and light; header one row on phones (51 px).
- No undersized targets (24 px rule) outside the stop handles (which have an enlarged hit area).
- Collapsed panels keep their state across re-renders; seven distinct panel keys.
- Mode switch by arrow keys keeps focus on the segmented control.
- Big-export dialog Escape closes it and leaves the export buttons enabled.
- Worst cases: 64-char names truncate with ellipsis; 60 layers render with no blank thumbnails; 80 emoji copies 47 ms per frame; 24 palette colours 31 ms; long import warnings wrap in the toast (420 px).
- 0 console errors through all probes.

## Slice E: cyex spec, motion, break-ui (code review agent; my verification in brackets)
- [MEDIUM][CONFIRMED at 375/320; not at desktop] Palette rows wrap the hex field onto a second line on phones (row 73 -> 107 px). css .prow needs a narrow-container layout.
- [MEDIUM] Import warnings show as a 3,5 s green success toast; long warnings vanish before they can be read. store.js loadJson + toast life.
- [MEDIUM] Export Cancel does nothing during "Encoding…" (only checked in the frame loop); the file still downloads. export.js runExport.
- [MEDIUM] Cancel appears in a new row mid-export (layout shift); focus not moved to it or back afterwards (merged with my Cancel focus finding).
- [MEDIUM] Long settings titles ("Element: <name>") truncate with no tooltip for the full text. ui.js panel().
- [MEDIUM][PLAUSIBLE] Drag auto-scroll top zone sits under the sticky header (top edge 0, header ~61 px). ui.js sortable edge().
- [LOW] Error copy still "Could not…" in anim-editor.js, playback.js, editors.js; raw e.message shown in two static export errors.
- [LOW] Straight apostrophe "weren't" next to curly "wasn’t"; terse "Angle X became Y" (paint.js normalize).
- [LOW] Panel collapse keys are titles: static and animated "Paint" / "Export" share one state. ui.js panel() key.
- [LOW] .ptoggle has no hover / :active feedback and no aria-controls.
- [LOW] Chevrons animate while bodies snap (acceptable for a dense tool; noted only).
- [LOW] Reduced-motion block doesn't cover chevron and sortable transitions.
- [LOW] Duplicate CSS rules (.shadow-row, canvas.pname, .item .name, .color) to merge.
- [LOW] Palette shares can sum to 99 or 101 % (plain rounding).
- [LOW] No cap on palette colours (stops are capped at 32); engine caps at 24, editor doesn't.
- [LOW] Add stop isn't disabled at the cap (toast after click instead).
- [LOW] Big-export dialog: statement title; Enter fires "Export anyway" when focus is on the box (risky default). Merged with my "no initial focus" finding.
- [LOW] Escape doesn't cancel an in-progress drag.
- [LOW][unverified] Collapse-all toggle works invisibly when the settings panel itself is collapsed.

## Slice D: a11y, keyboard and behaviour (code review agent; my verification in brackets)
Clean: every A.x() call is registered; load order correct; undo token map correct; collapse toggles keep focus; confirmHeavy resolves on Escape, close button, backdrop.
- [HIGH][PLAUSIBLE: focus jump not reproduced; lost first click can't be tested synthetically] Rename commit on blur re-renders the editor, which can swallow the click that caused the blur. anim-editor.js rename done().
- [MEDIUM][CONFIRMED by code] Ctrl+Z / Ctrl+Y / Space ignored while focus is on a range, checkbox or colour input (typing check matches every input). main.js keydown.
- [MEDIUM][PLAUSIBLE] Removing a stop, palette colour or shadow (button or Delete key) drops focus to the page; in-place renders don't restore focus. ui.js stopsEditor/paletteEditor, editors.js shadows.
- [MEDIUM] Shadow rows' X / Y / Blur / Opacity controls all share the same names; colour-field alpha is always "Opacity". editors.js shadowsPanel, ui.js colorField.
- [MEDIUM][PLAUSIBLE] A drag interrupted by a re-render (Ctrl+Z, file drop) leaks its rAF loop and leaves .sorting set. ui.js sortable.
- [MEDIUM][CONFIRMED] A collapsed settings panel stays collapsed for every new selection, so selecting a layer looks like it does nothing. key 'settings'.
- [MEDIUM] Export Cancel: not focused when shown, ignored during encoding, hides itself while focused; progress text isn't announced (merged with slice E and mine).
- [MEDIUM][CONFIRMED] "Size and timing" reopens on every render (open:true overrides the saved state). anim-editor.js paintPanel.
- [LOW] Panel counts (Colour stops, Shadows) go stale after in-place edits.
- [LOW] Collapsing Preview hides the transport while Space still toggles playback; the hidden canvases keep drawing.
- [LOW] Panel keys collide between modes (merged with slice E).
- [LOW] Settings panel title (its toggle's accessible name) goes stale on rename; no aria-controls.
- [LOW] Empty-state div directly inside role=list; aria-current vs selection semantics.
- [LOW] No h1; library categories are spans; aria-controls left pointing at a closed popover.
- [LOW] select() sets an empty aria-label when it has no label.
- [LOW] Stop-handle arrow keys commit an undo step per key repeat and can order handles out of index order.
- [LOW] modeSeg.setValue rebuilds the radios on undo/redo even when the mode didn't change, dropping focus.
- [LOW] Collapse-all toggle shows "Expand all" and does nothing when a panel has no groups.
- [LOW][unverified] The drag-to-place hint doesn't mention the X/Y sliders as the keyboard alternative.
