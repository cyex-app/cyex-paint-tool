# Findings

## Browser slices (A layout, B functional/edge), verified in the pane

- [HIGH] Keyboard focus is lost to <body> after many actions that re-render the editor
  Where: Animated editor @ all viewports, keyboard
  Repro: Tab to a layer's eye button, press Enter (or pick a Blend option from the select, or Duplicate/Delete, or change a select that shows/hides settings)
  Expected / actual: focus stays on the control (or a sensible neighbour) / document.activeElement becomes BODY, keyboard users start again from the top
  Evidence: afterEye "BODY", focusAfterSelect "BODY." (JS probe)
  Likely cause + fix: renderEditor() (js/app.js) rebuilds #editor; remember a focus key (data-id + control role) before and restore after render

- [HIGH] Scales layer jumps at the loop point (not seamless)
  Where: Layer "Scales" @ any
  Repro: add Scales, play; compare frame at t=0 and t=1
  Expected / actual: identical / max channel diff 0,75
  Evidence: loop test "scales Δ0.75"
  Likely cause + fix: js/more.js scales sample uses `t * p.speed * 0.25`; use whole cycles (`t * p.speed`)

- [MEDIUM] Heavy settings freeze-render for a minute with no estimate or cancel
  Where: Export GIF/APNG/Sheet/Name GIF @ 512×128, 50 fps, 8 s
  Repro: set those, export
  Expected / actual: a warning or a Cancel / ~62 s of rendering (155 ms per frame × 400 frames), all frames held in memory (~100 MB)
  Evidence: ms512=155, est400frames_s=62
  Likely cause + fix: show frame count × size estimate before export; add Cancel; cap frames or warn above ~250

- [MEDIUM] Exporting an empty paint silently produces a transparent GIF
  Where: Export with no layers
  Repro: delete all layers, Export GIF
  Expected / actual: a notice "Add a layer first" / downloads an 8,6 KB invisible GIF
  Likely cause + fix: guard in animOutput export handlers

- [MEDIUM] Drag grips are 18×26 px, below the 24 px target minimum (WCAG 2.5.8)
  Where: layer/effect rows, palette colours, shadows
  Evidence: audit "Move Shine sweep 18x26"
  Likely cause + fix: .grip width 24px (css/app.css)

- [MEDIUM] Sticky header takes 139 px at 320 wide (103 px at 375)
  Where: header @ 320×568, 375×812
  Expected / actual: ≤ ~60 px so the editor has room / a quarter of the screen is header
  Likely cause + fix: at ≤640 px, make the header non-sticky or put the mode switch and tools on one row with icon-only buttons

- [MEDIUM] Long labels are truncated so the meaning is lost
  Where: "Name colour (shows through transparent parts)" at 1024–2560 and phones; "Name size for name exports" at 320; colour-field "Opacity" label in shadow rows at 1440+
  Likely cause + fix: shorter labels ("Name colour", "Name size") with the explanation in a hint line

- [MEDIUM] Imported angle outside 0–360 is kept in JSON while the slider shows 360
  Where: Import JSON with "angle": 9999
  Expected / actual: angle normalised (9999 → 279) / JSON says 9999, UI says 360
  Likely cause + fix: Paint.normalize: angle = ((angle % 360) + 360) % 360

- [LOW] Invalid colour strings import as black without a warning
  Where: Import JSON with "color": "zz"
  Likely cause + fix: Paint.normalize: collect invalid colours and toast a warning

- [LOW] Gradient stop handles are 14 px wide
  Where: Colour stops bar
  Likely cause + fix: widen the hit area with a transparent ::before (24 px) while keeping the visual 14 px

- [LOW] Paint size field parses "1e3" as 1 and "0" as the default 256
  Where: Animated Paint panel width/height
  Likely cause + fix: Number() instead of parseInt, clamp 0 to the minimum

- [LOW] An empty preview name shows nothing at all
  Where: Preview name field cleared
  Likely cause + fix: fall back to a placeholder name ("lumen_fox") when empty

- [LOW] Every layer delete raises a toast; deleting several in a row stacks them
  Where: Layers list
  Likely cause + fix: one toast that counts ("Removed 3 layers")

## Passed
- No horizontal scroll at 320 to 2560 in either mode; landscape 844×390 fine.
- Light theme switch, presets dialog Escape returns focus, select popover keyboard (arrows, Enter), Space play/pause, tooltips, drag reorder (pointer and Alt+arrows), palette strength shares, canvas drag to place, empty states, invalid JSON import error, RTL/emoji/CJK preview names.
- 53 layers and 38 effects render without errors; GIF/APNG decode as valid images; step-based effects (glitch, VHS, digital rain, lightning, skyline, maze arcs) cycle correctly.

## Slice D: cyex compliance and motion (code review agent, static)
Spec checks that passed: tokens only (no stray hex, radii, z-index or durations), focus ring is --focus-ring, accent only for state, tooltip delays, toast cap and lifetimes, square cards and dialogs, entrance easings.

- [MEDIUM] Toast drain bar freezes after hover; focus does not hold the toast (js/ui.js toast)
- [MEDIUM] Repeated toasts stack instead of bumping a ×N count; "Added X." toast on every add is noise (js/ui.js toast, js/app.js openLibrary add)
- [MEDIUM] Animated preview autoplays with no reduced-motion branch (js/app.js rt.playing)
- [LOW] :hover rules not gated behind (hover: hover), so they stick on touch (css/app.css)
- [LOW] Missing :active press feedback on seg buttons, options, nav items, group heads, list rows, select trigger (css/app.css)
- [LOW] Error toasts (left stack) slide in from the right (css/app.css toast-in)
- [LOW] Popover entrance drifts the wrong way when flipped above; not aligned to anchor end for menus (js/ui.js popover, css/app.css pop-in)
- [LOW] Open popover stays fixed while the page scrolls (js/ui.js popover)
- [LOW] Dialog: Enter does not submit the primary action (js/ui.js dialog)
- [LOW] Slider tracks use --radius-pill (switch tracks and badges only) (css/app.css range)
- [LOW] Stop handle uses a non-token drop shadow on a non-floating element (css/app.css .handle)
- [LOW] Hit targets below the 32/40 px floor on touch (.icon-btn.sm 26, .num 26, .grip 18, .handle 14) — add (pointer: coarse) enlargements
- [LOW] Error copy not in "Couldn’t X. Try again." form (js/app.js toasts)
- [LOW] UK "Colour" spelling vs cyex voice examples using "color" (see questions.md)
- [LOW] Percent units written without a space ("50%") vs the spec's "50 %" — see questions.md
- [LOW] Toast drain bar has no deliberate reduced-motion branch
