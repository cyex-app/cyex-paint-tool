# improve report: cyex paints (2026/11/13)

**No source files were changed.** This folder is not a git repository, and deep-improve's safety rule is audit-only without one (questions.md, item 3).

Baseline checks (there is no test suite): build.ps1 passes; browser smoke passes (all 53 layers, 38 effects and 41 presets render; GIF/APNG decode; 0 console errors). Final = baseline, since nothing changed.

Auditors: break-ui, improve-animations, a general code-quality agent (in place of the missing improve / thermo-nuclear / architecture skills), plus the verified uitest report (../2026-11-13-uitest/report.md).

## Ready to fix once git is set up (small or medium, low risk)
High:
1. Settings groups never collapse (CSS `[hidden]` overridden). Confirmed in the browser.
2. Focus is lost after re-renders, after Tab in the select, after palette and shadow reorder, and after closing the library (uitest).
3. Space on a list row toggles play (uitest).
4. Load and import guard: try/catch plus one `sanitizeDoc` that clamps size, fps, duration, counts and params to their min/max, and reports dropped unknown layers.
5. Export: clone the doc at start, one export at a time, a Cancel button, a warning for heavy settings, and a guard for an empty paint.
6. `image_url`: allow only http(s) and escape it inside `url("…")`.
7. Loop seams in Scales and the skyline back row.

Medium:
- Drag-to-place keys made explicit (stops it hijacking Checker and Cells).
- Import dialog caches images.
- Redo commits pending edits first.
- Revoke blob URLs.
- Project tab: valid JSON without image data, updated only while visible.
- Mountains LUT moved out of the frame loop.
- ZWJ emoji kept together with `Intl.Segmenter`.
- Long names don't squash canvases.
- Toast fixes: drain, focus hold, ×N count, overflow-wrap.
- Reduced motion starts the preview paused.
- Select popover ARIA (activedescendant, name), plus Palettes menu keys.
- File chooser gets a focus ring.
- Labels shortened.
- Grips and handles get 24 px hit areas.
- Angle normalised on import.
- Hint when all palette strengths are 0.
- Mesh gradient NaN guard.
- Sortable transition conflict fixed.

## Proposals that need your decision (bigger or riskier)
- Split app.js into store, namepaint, editors, playback, export and dialogs; merge duplicated helpers into a shared fx.js (size L).
- Hot-path allocation pass and an O(N) blur (M). Needs a frame-hash comparison before and after.
- Memory: an LRU byte cap for the preview cache, and images kept out of undo snapshots (M, changes the history format).
- Cache thumbnails per layer (M).
- Cap stops at 24, and auto-scroll when dragging long lists (M).
- Forced-colours and prefers-contrast styles, a 3:1 control-border token, and hover gated to hover-capable devices (M, touches the cyex token file).
- A phone layout for the header (M).

## Dropped in verification
- "A one-stop gradient is invalid CSS": Chrome accepts it (checked in the browser).

## Update: fixes applied (after the user said to commit straight to main)
Git was initialised on `main` (no branch, as asked); repo-local identity only. 7 commits, listed in changes.md.
Final checks: build passes; every layer (53), effect (38) and preset (41) renders; loop-seam test clean except intended step effects; GIF/APNG/sheet exports and cancel verified; no horizontal scroll 320 to 2560; 0 console errors.
Still proposals (not done): split app.js, hot-path allocation pass and O(N) blur, images out of undo history, per-layer thumbnail cache, stop cap and drag auto-scroll, 3:1 control-border token in the cyex token file.

## Update: proposals done
- app.js split into js/app/ (store, namepaint, editors, anim-editor, playback, export, dialogs, main) sharing PL.App. Commit 5cb6b4e.
- Shared helpers in js/fx.js; per-pixel allocations removed; O(1) running-sum blur. All 134 render fingerprints byte-identical before and after. Commit dcaf851.
- --control-border token (>= 3:1 in both themes) and a one-row phone header. Commit 7695c6d.
- Thumbnail cache per layer (selecting a layer re-renders nothing; thumbs render at paint size so particles show).
- Undo history stores each picture once (tokens in snapshots); undo/redo with pictures verified.
- Gradient stops capped at 32 in the editor (imports keep up to 64).
- Drag reorder auto-scrolls the page or the settings column near its edges.
