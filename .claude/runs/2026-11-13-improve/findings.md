# improve findings (verified status in brackets)

## From break-ui + improve-animations audit
- [HIGH][CONFIRMED in browser] Collapsible settings groups never collapse: .gbody{display:flex} beats [hidden]. css/app.css .gbody. Fix S: `.gbody[hidden]{display:none}`.
- [HIGH][PLAUSIBLE] Imported projects / saved state never range-checked (width, fps, duration, counts) -> hang/NaN, persisted to localStorage. app.js healDoc, engine.js fixParams. Fix M: clamp in healDoc + fixParams to pd.min/max.
- [HIGH][PLAUSIBLE] Picture layers make every edit re-stringify MB data URLs (Project code tab on each input, 120 undo snapshots, save). app.js outputGetter/snap/save. Fix M.
- [MEDIUM][CONFIRMED] ZWJ/VS16/flag emoji split in Text and emoji element ("👨‍👩‍👧" -> 5 parts). elements.js glyph. Fix S: Intl.Segmenter.
- [MEDIUM][PLAUSIBLE] Long preview names squash animated name canvases (max-width:100%). css .pname. Fix S.
- [MEDIUM][PLAUSIBLE] Preview frame cache unbounded (up to ~800 MB at 1024×512, 400 frames). app.js getFrame. Fix S: byte cap.
- [MEDIUM][PLAUSIBLE] Sortable: .sortable-item transition overrides .item background transition; no autoscroll for long lists; no settle on drop. Fix S/M.
- [DROPPED] One-stop gradient invalid CSS: Chrome accepts a single stop (verified), not reproduced.
- [MEDIUM][PLAUSIBLE] All palette strengths 0 renders nothing with no hint. ui.js paletteEditor. Fix S.
- [MEDIUM][PLAUSIBLE] No stop cap; 200 stops unusable. Fix M (proposal).
- [MEDIUM][PLAUSIBLE] Unknown layer types dropped silently on import. app.js healDoc. Fix S.
- [MEDIUM][PLAUSIBLE] Thumbnails re-render every layer on every selection click. app.js drawThumbs. Fix M.
- [MEDIUM][PLAUSIBLE] Long unbreakable names overflow toasts; layer names unbounded. Fix S.
- [MEDIUM][unverified] Palette rows may overflow under ~340 px. Fix S/M.
- [LOW] Quota fallback drops pictures silently; extreme-aspect sprite may exceed canvas limits.
- [LOW][unverified] Escape in rename may still commit via blur.
- [LOW] No exit animations for dialogs/toasts.
- [LOW] Hex input reverts silently; no maxlength.
- [LOW] Preview keeps rendering behind open dialogs.

## From the code-quality audit (bugs, perf, security, maintainability)
- [HIGH][PLAUSIBLE] Bad saved/imported state bricks the app on every reload (unguarded healDoc/normalize/compile; bad state re-saved). app.js load + tick. Fix S.
- [HIGH][PLAUSIBLE] No range validation on import/load (merged with the break-ui finding above). Fix M: one sanitizeDoc.
- [HIGH][PLAUSIBLE] Export races with edits (reads live doc after awaits, mixes rt.cache frames). Fix M: clone doc at export start, export lock + cancel.
- [HIGH][PLAUSIBLE] Per-pixel allocations in hot paths (bilinear closures, remap arrays, flow(), stars Object.assign per pixel, plaid/sharpen arrays). Fix M.
- [MEDIUM][CONFIRMED by code] Project code tab shows truncated, invalid JSON (.slice(0, 20000)); Copy copies corrupt JSON. Fix S.
- [MEDIUM][PLAUSIBLE] Frame cache and 120 undo snapshots grow without bound (images in every snapshot). Fix M.
- [MEDIUM][CONFIRMED by code] Drag-to-place hijacks Checker and Cells: their cx/cy mean columns/rows, so dragging sets the column count to ~0,5. Fix S: explicit dragKeys.
- [MEDIUM][CONFIRMED by code] Import JSON dialog doesn't cache project images (drop and Open project do). Fix S.
- [MEDIUM][PLAUSIBLE] Redo can overwrite an uncommitted edit (redo doesn't commit first). Fix S.
- [MEDIUM][CONFIRMED by code] Blob URLs never revoked in showResult (one per re-render). Fix S.
- [MEDIUM][CONFIRMED in loop test] Skyline back row jumps at the loop (0,5 speed factor). Fix S.
- [MEDIUM][CONFIRMED by code] Mountains rebuild a LUT per ridge per frame. Fix S.
- [MEDIUM][CONFIRMED by code] image_url goes unescaped into CSS url(...) and the exported CSS: an untrusted paint JSON can add extra background requests or break out of the rule. Fix S: validate http(s), quote and escape.
- [LOW] Oversized sprite sheet -> toBlob null -> uncaught error. Fix S.
- [LOW] Several exports can run at once. Fix S.
- [LOW] save() quota fallback silently drops pictures; no multi-tab guard.
- [LOW][unverified] Escape in rename may commit (merged with above).
- [LOW][PLAUSIBLE] Mesh gradient NaN when all strengths are 0. Fix S.
- [LOW] GIF mapper caches by first pixel in a bucket (slight shimmer). Fix S.
- [LOW] boxBlur O(N·r), mixed edge modes. Fix M.
- [LOW] Duplicated helpers across library.js / more.js / engine.js / app.js / paint.js. Fix M (proposal).
- [LOW] app.js is a 1.000-line god file. Fix L (proposal: store / namepaint / editors / playback / export / dialogs).
- [LOW] Magic numbers and inconsistent param names (cx/cy, stops/pal, speed/mspeed); unused innerHTML branch in h().
