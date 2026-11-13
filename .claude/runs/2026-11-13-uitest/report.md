# uitest report: cyex paints (2026/11/13)

**Summary:** 0 blockers, 10 high, 20 medium, about 25 low. The tool works end to end: every layer, effect, preset and export runs without console errors, and there is no horizontal scroll at any tested width. The weak spots are keyboard and screen-reader use (focus lost after re-renders, the custom select, Space hijacked for play) and a handful of polish items against the cyex spec.

Covered: viewports 320 to 2560 and landscape 844×390 (DOM measurement), dark and light themes, mouse and keyboard (synthetic events), functional and edge-case probes, a loop-seam test of every layer and effect, encoder validity, and two code-review slices (accessibility, cyex spec and motion).
Not covered: real screen reader output, forced-colours and prefers-contrast rendering (the pane cannot emulate them), real touch hardware, visual judgement at full resolution (the pane gives small screenshots), and localStorage persistence (blocked in the pane; checked by reading code).

## High (verified in the browser unless marked)
1. **Focus is lost to the page after re-renders.** This happens after the eye toggle, duplicate, delete, a Blend or other select choice, undo or redo, and closing the library. Fix: restore focus by data-id and role after `renderEditor()` (js/app.js).
2. **Tab inside an open select drops focus to the page.** Fix: focus the trigger before `closePop()` (js/ui.js select).
3. **Space on a focused layer row (or a select option) also toggles play.** Fix: skip when `e.defaultPrevented`, or when focus is in `.item` or a listbox (js/app.js keydown).
4. **Palette and shadow Alt+Up/Down reorder loses focus after one move.** Fix: refocus the moved grip inside `sortable()` (js/ui.js).
5. **The custom select and the Palettes menu are silent to screen readers.** They have no `aria-activedescendant` and no listbox name, and Palettes has no keyboard handling. (code)
6. **The image file chooser shows no focus ring.** The input is sr-only and the label has no `:focus-within` style. (code)
7. **The Scales layer jumps at the loop point.** It uses `t * speed * 0.25` (js/more.js).
8. **Escape in the library search closes the dialog instead of clearing the search.**

## Medium
- Heavy exports (512×128, 50 fps, 8 s, about 62 s of rendering, around 100 MB of frames) have no estimate or Cancel.
- An empty paint exports a blank GIF without warning.
- Drag grips are 18 px wide and stop handles 14 px, below 24 px. Touch targets are below the cyex 32 and 40 px floors.
- The sticky header is 139 px tall at 320 wide.
- Labels are truncated: "Name colour (shows through…)", "Name size for name exports", and the colour "Opacity" in shadow rows.
- An imported angle above 360 stays in the JSON while the slider shows 360.
- Toasts: the drain bar freezes after hover, focus doesn't hold a toast, repeats stack instead of counting, the "Added X" toast is noise, and there may be a double live-region announcement.
- The preview autoplays under reduced motion.
- Layer rows are focusable listitems with no name or role. The eye button flips its label and also uses aria-pressed.
- There are no forced-colours or prefers-contrast styles, and selected states use background or box-shadow only.
- Range inputs expose raw values (0,5) instead of 50 %.
- Control borders are below 3:1 non-text contrast.
- The "?" hints and keyboard help are only in hover tooltips.

## Low
- Hover styles aren't gated behind `(hover: hover)`.
- Some controls lack `:active` feedback.
- Error toasts enter from the wrong side.
- Popover placement is off: menus aren't end-aligned, the flip animation runs the wrong way, and popovers don't close on scroll.
- Enter doesn't submit dialogs.
- Slider tracks use the pill radius.
- The stop handle has a non-token shadow.
- Error copy isn't in the "Couldn't X. Try again." form.
- Invalid imported colours silently become black.
- The size field parses "1e3" and "0" oddly.
- An empty preview name shows nothing.
- Deleting several layers stacks a toast per delete.
- The segmented control lacks Home/End, and the mode switch re-renders on every arrow press.
- Disabled Undo and Redo leave the tab order.
- An invalid hex has no error message.
- The static preview reads the name four times to a screen reader.
- The toast drain bar has no reduced-motion branch.

## Coverage
| Surface | Viewports | Themes | Keyboard | Edge cases |
|---|---|---|---|---|
| Header | all | both | yes | – |
| Static editor and stage | all | dark, light | partly | import, names, stops |
| Animated editor | all | dark | yes | sizes, empty, many copies, text |
| Dialogs (library, presets, import) | 1440 | dark | yes | search, invalid JSON |
| Exports | 1440 | dark | – | empty, heavy, all formats |

Full details: findings.md. Open questions: questions.md.
