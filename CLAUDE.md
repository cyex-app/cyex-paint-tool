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
- **Self-test:** open `cyex-paints-tests.html`. It renders every layer, effect and preset and compares pixel fingerprints with `js/tests-baseline.js`, and checks loop seams, keyframes, clip masks, groups, sanitising, the 7TV format, palettes, the encoders and the render worker. After an intentional visual change, press "Copy new baseline" and paste it into `js/tests-baseline.js`.
- Claude's built-in browser pane opens project files as `data:` snapshots: relative CSS/JS don't load (test the bundles), `localStorage` throws (shim it for My paints tests), and files above ~512 KB don't open (the app bundle is ~520 KB; for pane testing strip leading whitespace and comment-only lines into a temporary copy inside the project folder, then delete it). Synthetic clicks don't move focus like real ones; discount focus results from them.

## Code layout (plain JS, classic scripts, global `PL`)
- `js/core.js` maths, colour packing (7TV signed 32-bit RGBA: `(r<<24)|(g<<16)|(b<<8)|a`), weighted palettes, noise, `PL.makeCanvas` (canvas or OffscreenCanvas), `PL.imageCache`.
- `js/fx.js` shared pixel helpers (bilinear, remap, running-sum boxBlur, hueMatrix).
- `js/paint.js` static 7TV paints: normalize (classic, layered `gradients[]` + `text`, API `data` wrapper), CSS exactly as the 7TV extension builds it, rasteriser, safe image URLs.
- `js/encode.js` own GIF (median cut, LZW, change-only frames, per-frame palettes), animated WebP muxer, APNG, size estimate.
- `js/library.js`, `js/more.js` per-pixel layers and effects; `js/elements.js` canvas-drawn scene elements with motion and copies; all motion uses whole cycles per loop so loops are seamless.
- `js/engine.js` compile/render, blending, keyframes (`item.keys`, wrap across the loop end), clip masks, groups, `sanitizeDoc` (clamps everything loaded).
- `js/presets.js`, `js/surprise.js`, `js/render-worker.js` (engine scripts marked `data-engine` are re-used inside a Blob worker in the bundle).
- `js/ui.js` the toolkit (panels, sliders, selects/listboxes, palette and stops editors, sortable, dialogs, toasts, tooltips, From image).
- `js/app/*` the editor, sharing `PL.App = A`: store (state, history, persistence), namepaint, editors (static editor, preview, layered), anim-editor (layers, groups, settings, keyframe UI), timeline, playback, export, dialogs, mypaints, main (boot, header, shortcuts, focus restore). Modules call each other through `A` at call time only.
- New features get their own CSS file in `css/` linked from `index.html`.

## Things that bit us before
- Re-renders must keep keyboard focus: `main.js` `focusDescriptor`/`restoreFocus` match by `data-id` + aria-label (prefix before ':'); in-place editors refocus their neighbour themselves.
- `A.state.anim` / `A.state.static` are replaced on undo, presets and imports: never hold them in closures.
- `sed -i` with `c\` or multi-line replacements in Git Bash joins lines and mangles regex escapes; use the Edit tool for anything but one-line substitutions.
