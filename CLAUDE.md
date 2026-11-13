# cyex paints: project notes for Claude

A local editor for 7TV name paints: static gradient paints (7TV classic and layered formats) and animated paints built from layers, scene elements and effects, exported as GIF, WebP or APNG. Everything runs in the browser from `file://`; nothing is uploaded.

## Hard rules from the owner
- **No local ports, no dev servers.** Test by opening files from disk. Ask before downloading or installing anything.
- **Commits:** straight to `main`, no feature branches. Author is `sery-yx` only: **no `Co-Authored-By` trailer**, no "Generated with" lines.
- **Design:** the cyex design system (skills `cyex-design` + `cyex-app`, web-tool density). Tokens only (`css/tokens.css`), 3px control radius, square cards, accent only for primary action / selection / links / progress, focus ring `--focus-ring`, sentence-case copy, no exclamation marks, curly apostrophes, "Couldn’t X. Try again." errors, numbers `1.000`, decimals `1,5`, dates `2026/11/13 14:02`. Kept on purpose: British "Colour", "50%" without a space.
- Long or autonomous runs (`#uitest`, `#improve`, `#optimize`): don't stop to ask; write questions to the run's `questions.md` with the safe default; keep state in `.claude/runs/<date>-<name>/`.

## Build and test
- `index.html` loads the separate files; `cyex-paints.html` is the single-file bundle people open. Rebuild after every source change:
  `powershell -ExecutionPolicy Bypass -File .\build.ps1` (also builds `cyex-paints-tests.html`).
- **Quick check without a browser:** `node tools/check.js` (every per-pixel layer and effect) or `node tools/check.js js/packs/<name>.js` (one pack): NaN, loop seams, blank or static output, speed.
- **Self-test:** open `cyex-paints-tests.html`. It renders every layer, effect and preset and compares pixel fingerprints with `js/tests-baseline.js`, and checks loop seams, keyframes, clip masks, groups, sanitising, the 7TV format, palettes, the encoders and the render worker. After an intentional visual change, press "Copy new baseline" and paste it into `js/tests-baseline.js`.
- Claude's built-in browser pane opens project files as `data:` snapshots: relative CSS/JS don't load (test the bundles), `localStorage` throws (shim it for My paints tests), and files above ~512 KB don't open (the app bundle is ~520 KB; for pane testing strip leading whitespace and comment-only lines into a temporary copy inside the project folder, then delete it). Synthetic clicks don't move focus like real ones; discount focus results from them.

## Code layout (plain JS, classic scripts, global `PL`)
- `js/core.js` maths, colour packing (7TV signed 32-bit RGBA: `(r<<24)|(g<<16)|(b<<8)|a`), weighted palettes, noise, `PL.makeCanvas` (canvas or OffscreenCanvas), `PL.imageCache`.
- `js/fx.js` shared pixel helpers (bilinear, remap, running-sum boxBlur, hueMatrix).
- `js/paint.js` static 7TV paints: normalize (classic, layered `gradients[]` + `text`, API `data` wrapper), CSS exactly as the 7TV extension builds it, rasteriser, safe image URLs.
- `js/encode.js` own GIF (median cut, LZW, change-only frames, per-frame palettes), animated WebP muxer, APNG, size estimate.
- `js/library.js`, `js/more.js` per-pixel layers and effects; `js/packs/*.js` themed packs (geometric, nature, retro, stylise, surfaces), contract in `js/packs/README.md`, every item has search `tags`; `js/elements.js` canvas-drawn scene elements with motion and copies; all motion uses whole cycles per loop so loops are seamless.
- `js/engine.js` compile/render, blending, keyframes (`item.keys`, wrap across the loop end), clip masks, groups, `sanitizeDoc` (clamps everything loaded), custom code items (`doc.custom`, ids `custom_*`, registered on sanitize and compile so the worker gets them).
- `js/tags.js` search tags for built-in items and synonym groups.
- `js/presets.js`, `js/surprise.js`, `js/render-worker.js` (engine scripts marked `data-engine` are re-used inside a Blob worker in the bundle).
- `js/ui.js` the toolkit (panels, sliders, selects/listboxes, palette and stops editors, sortable, dialogs, toasts, tooltips, From image).
- `js/app/*` the editor, sharing `PL.App = A`: store (state, history, persistence, `loadJson` with the custom-code trust gate), namepaint, editors (static editor, preview, layered), anim-editor (layers, groups, settings, keyframe UI), timeline, playback, export, dialogs, mypaints, search (ranked, typo-tolerant, synonyms, similar), userlib (My library: pictures, saved items, code editor, import/export, trust prompt), scroll (one page scroll; sticky columns that scroll with the page when taller than the window), main (boot, header, shortcuts, focus restore). Modules call each other through `A` at call time only.
- New features get their own CSS file in `css/` linked from `index.html`.

## Things that bit us before
- Re-renders must keep keyboard focus: `main.js` `focusDescriptor`/`restoreFocus` match by `data-id` + aria-label (prefix before ':'); in-place editors refocus their neighbour themselves.
- `A.state.anim` / `A.state.static` are replaced on undo, presets and imports: never hold them in closures.
- Custom code from a file that isn't the person's own (not in My library, not in the open paint) must never run without asking: `A.loadJson` strips it and `askRunCode` asks. My paints and saved state are trusted.
- The app bundle is over the pane's ~512 KB limit: for pane tests strip pack scripts and comments into a temporary copy (the tests bundle includes the packs).
- `sed -i` with `c\` or multi-line replacements in Git Bash joins lines and mangles regex escapes; use the Edit tool for anything but one-line substitutions.
