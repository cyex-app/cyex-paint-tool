# Focused uitest report: new features (2026/11/13)

**Summary:** 0 blockers, 2 high (both confirmed in the browser), 22 medium, about 20 low. Nothing breaks and there were no console errors. The layout holds from 320 to 2560 in both themes. Most findings are keyboard focus after rebuilds, screen-reader feedback, and a few edge cases in keyframes and My paints.

Covered:
- **Browser:** keyframes and the timeline, groups and clip masks, the Layered static editor, the chat preview, My paints (with storage shimmed), History, Surprise me, From image, and the export format, estimate, worker and Cancel.
- **Matrix:** 320, 390, 768, 1440 and 2560, in dark and light, using keyboard flows and worst-case data (a 3000×3000 picture, 1×1 and transparent pictures, 10 gradient layers, 64-character names, 20 quick rerolls).
- **Code review:** two slices, accessibility and behaviour, and the cyex spec, motion and worst-case data.

Not covered:
- Real screen-reader output.
- Real touch hardware.
- Persistent storage across a real reload (shimmed in the pane).
- Profiling with 40 animated values × 32 keys, and with 100 saved paints (reviewed in code only).

## High
1. **Surprise me loses focus:** "Another" and R rebuild the card, so focus drops to the page. The R shortcut then stops working, and the new paint isn't announced. (dialogs.js roll)
2. **The Layered editor loses focus:** Duplicate layer, changing a layer's function and the automatic-size checkbox rebuild every card, dropping focus to the page. (editors.js layersPanel)

## Medium
- **Keyboard shortcuts:**
  - Space toggles playback from checkboxes, sliders, the timeline ruler and the file input.
  - Ctrl+Z, Ctrl+Y and Ctrl+S act behind an open dialog (plausible).
- **Timeline:**
  - Key moves and easing changes aren't announced, and every key is a tab stop.
  - Keys are 20×26 px and become unreachable when packed close together.
  - Playback restyles the whole timeline every frame, which gets heavy with many keys.
  - Keys aren't re-snapped when the loop length or frames per second change, so they can collapse onto one frame.
  - At the 32-key limit, dragging repeats a toast on every move and silently drops the change.
  - Keyed palette strength sliders don't follow the playhead.
- **Groups:**
  - Membership isn't exposed to screen readers.
  - A group can't be moved as a whole, and a collapsed group's layers can't be reordered.
  - Grouped plus clipped rows squeeze names to about 21 px on touch-capable screens.
- **My paints:**
  - Every Open button is just "Open".
  - The armed delete times out silently after 3 s, and when armed it overflows its card.
  - Renaming the open entry is reverted by the next save (plausible).
  - Names are capped at 60 characters, while paint names allow 64.
  - Search re-reads the whole library on every keystroke.
- **Exports:**
  - The Surprise preview and the exported result images loop with no pause.
  - If the worker passes the feature check but then fails, the first export fails instead of falling back.
  - The size estimate renders up to 5 full-size frames on the page thread after each edit.
- **From image:** the button is disabled while it reads the file, so focus drops.

## Low
About 20, all in findings.md:
- **History:** no announcement after a history jump, undo or redo; history labels are often generic.
- **Groups:** collapsing a group counts as an undo step and waits 220 ms, and "Delete group" actually ungroups.
- **Tooltips:** the layer delete tooltip reads "Delete key"; group names have no full-name tooltip.
- **Timeline edge cases:** dropping a key on another replaces it silently, the frame readout lags, and Shift+Arrow stops short of the edge.
- **Touch:** dragging on the paint image has no touch-action setting, and some new hover styles aren't guarded for touch.
- **Layered editor:** the Add button stays enabled at the 10-layer cap.
- **Surprise me:** held R isn't throttled, and the preview keeps running in hidden tabs.
- **From image:** a fully transparent picture gets the generic error message, and one decode path leaks a blob URL.
- **Visuals:** the accent marks "is animated", My paints thumbnails are soft, and Clip is allowed on the bottom layer.
- **Code:** dead `.chat` CSS, duplicate `[hidden]` rules and one straight apostrophe.

## Coverage
| Feature | Layout | Keyboard | Edge cases | Code review |
|---|---|---|---|---|
| Keyframes and timeline | 320–2560 | yes | 3 keyed values, limits from code | yes |
| Groups and clip | 320–2560 | yes | long names | yes |
| Layered static editor | 375, 1440 | yes | 10 layers | yes |
| Chat preview | 375, 1440 | – | – | yes |
| My paints and History | 1440 | yes | 60+ character names, empty search | yes |
| Surprise me | 1440 | yes | 20 rerolls | yes |
| From image | – | partly | 3000², 1×1, transparent | yes |
| Export format, estimate, worker | 1440 | yes | Cancel, WebP | yes |
