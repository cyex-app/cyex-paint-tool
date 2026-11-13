# Findings, focused pass on new features (browser slices, verified in the pane)

- [MEDIUM] Surprise me: "Another" drops keyboard focus to the page
  Where: Presets dialog > Surprise me card @ 1440, keyboard
  Repro: Surprise me, focus Another, press it
  Expected / actual: focus stays on Another (or the card) / BODY (the card is rebuilt)
  Likely cause + fix: js/app/dialogs.js: keep the button and only swap the preview, or refocus Another after rebuilding

- [MEDIUM] Grouped + clipped layer rows squeeze the name to ~21 px where row tools are always visible (touch-capable screens) in the 330 px layer column
  Where: Layers list @ 1440-2560 with a coarse pointer
  Evidence: row "Shine sweep": grip 32 + clip mark 16 + thumb 44 + name 21 + meta 35 + tools 100
  Likely cause + fix: css: drop the thumb (or meta) for grouped/clipped rows when tools are visible, or let the name wrap to a second line

- [LOW] Layered static editor: Add gradient layer stays enabled at the 10-layer cap (clicks silently do nothing)
  Likely cause + fix: js/app/editors.js layersPanel: disable Add with a tooltip at the cap

- [LOW][needs a fair re-check] History labels are often the generic "Changed paint settings" (my probes edited state directly, so labels from real UI edits may be better)

## Passed
- No horizontal scroll or undersized controls at 320, 390, 768, 1440, 2560, dark and light, with keys, a group, a clip mask and a 40-character name.
- Keyframes: diamond toggles and keeps focus (aria-pressed); timeline keys move a frame with arrows, Enter cycles easing, Delete removes, focus follows the key; ruler is a slider ("Frame 22 of 50").
- Groups: rename by F2, collapse hides members, Group select keeps focus, removing a group keeps its layers, undo restores it.
- History popover: listbox with aria-activedescendant, Enter jumps, focus returns to the History button, redo stays available after a jump.
- My paints (storage shimmed): Ctrl+S saves with a toast, search starts focused, rename caps at 60 characters, delete arms then confirms, empty search shows a message.
- Layered editor: 10 layers render, removing keeps focus on the next remove button, back to Classic warns and undo restores the layers.
- Export: format control by keyboard, WebP quality slider appears, estimate updates (~71 KB for WebP).
- From image: 3000×3000 picture in 167 ms, a 1×1 picture gives its one colour, a fully transparent picture is rejected with a message.
- 0 console errors.

## Slice C: a11y, keyboard, behaviour (code review agent; my verification in brackets)
- [HIGH][CONFIRMED in browser] Surprise me: focus lost after Another/R; the live region is recreated each roll, so the new paint isn't announced. dialogs.js card rebuild.
- [HIGH][CONFIRMED in browser] Layered editor: Duplicate layer, changing a layer's Function, and the automatic-size checkbox rebuild every card and drop focus to the page. editors.js layersPanel render().
- [MEDIUM] Space toggles playback from checkboxes, sliders, the ruler slider and the file input (Space guard misses input, role=slider, label). main.js keydown.
- [MEDIUM][PLAUSIBLE: browser test inconclusive] Ctrl+Z / Ctrl+Y / Ctrl+S act behind an open dialog. main.js keydown.
- [MEDIUM] Timeline keys: moves and easing changes aren't announced (label rewritten on the focused button), every key is a tab stop, keys are 20×26 px, the picked key isn't exposed.
- [MEDIUM] Group membership isn't exposed to assistive tech (layers in a group are flat siblings).
- [MEDIUM] A group can't be moved as a whole (no grip on group rows); a collapsed group's layers can't be reordered.
- [MEDIUM] My paints: every Open button is just "Open"; the armed delete times out after 3 s silently.
- [MEDIUM][PLAUSIBLE] Renaming the library entry you have open is reverted by the next Save (the open paint's name wins).
- [MEDIUM] Palette strength sliders don't follow the playhead when strengths are keyed.
- [MEDIUM] Keys aren't re-snapped when loop length or fps changes (keys can collapse onto one frame).
- [MEDIUM] Dragging an animated position at the 32-key limit raises a toast on every pointer move.
- [MEDIUM] Looping Surprise preview and the exported result images have no pause.
- [MEDIUM] If the worker passes the feature check but fails to start, the first export fails instead of falling back to the main thread.
- [MEDIUM] From image: the button is disabled while reading, so focus drops; not refocused.
- [LOW] History jump, undo and redo give no announcement.
- [LOW] Collapsing a group is an undo step.
- [LOW] Layer row delete tooltip hint reads "Delete key".
- [LOW] Preview name screen-reader text goes stale when the preview name changes.
- [LOW] Timeline: dropping a key on another silently replaces it; frame readout lags during moves; Shift+Arrow stops short of the edge.
- [LOW] Paint-image canvas has no touch-action: none, so touch drags scroll instead of placing.
- [LOW] Export estimate isn't a live region; worker progress label reads one frame ahead.
