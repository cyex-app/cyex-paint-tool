# uitest report, pass 2: cyex paints (2026/11/13)

**Summary:** 0 blockers, 1 high (plausible), 16 medium, about 30 low. Pass 1's blockers and highs are gone. The layout holds at every tested size and theme, the module split introduced no broken calls, and there were 0 console errors across every probe. What remains is mostly keyboard focus after in-place edits, export Cancel behaviour, collapse-state details, narrow phone rows and copy polish.

Covered:
- Viewports 320, 375, 390, 430, 640×400 (200 % zoom), 768, 844×390, 1024, 1280, 1440, 1920 and 2560, in dark and light.
- Keyboard flows, measured with synthetic events.
- The new features: panel collapse, the groups toggle, palette strengths, the stop cap, the thumbnail cache, drag auto-scroll, export Cancel and confirm, and import warnings.
- Worst-case data: 60 layers, 80 copies, 24 colours, 64-character names and long warnings.
- Two code-review slices, accessibility and design-system compliance.

Not covered:
- Real screen-reader output.
- Windows contrast themes and prefers-contrast rendering, which the pane can't emulate.
- Real touch hardware.
- Full-resolution visuals, since the pane screenshots are small.
- localStorage persistence, which the pane blocks (reviewed in code).
- Trustworthy focus after synthetic clicks: they don't move focus the way a real mouse does, so those results were discounted.

## High
1. **(Plausible)** Committing a rename on blur re-renders the editor, which can swallow the click that ended the rename. Fix: on blur, update only the row; re-render on Enter or Escape.

## Medium
- **Keyboard (confirmed in code):** Ctrl+Z, Ctrl+Y and Space do nothing while focus is on a slider, checkbox or colour input. Fix: treat only text inputs as typing (main.js).
- **Settings collapse (confirmed):** a collapsed settings panel stays collapsed when you select another layer. Fix: reopen it on selection change.
- **Size and timing (confirmed):** the group reopens on every render. Fix: make `open` a first-use default only.
- **Dialogs (confirmed):** clicking Presets repeatedly stacks several dialogs. Fix: allow one dialog per title.
- **Big-export dialog (confirmed):**
  - It opens with nothing focused, and Enter triggers "Export anyway".
  - Fix: focus Cancel first, and make the title a question.
- **Export Cancel:**
  - It isn't focused when it appears.
  - It's ignored during encoding, so the file still downloads.
  - It hides itself while focused, and appears in a new row (layout shift).
  - Progress isn't announced to screen readers.
- **Focus after removal (plausible):** removing a stop, palette colour or shadow drops focus to the page.
- **Shadows:** every row's controls share the same names ("X", "Opacity").
- **Drag reorder (plausible):**
  - A drag interrupted by a re-render keeps looping and leaves the list unselectable.
  - The auto-scroll zone at the top sits under the sticky header.
- **Palette rows on phones (confirmed at 375 and 320):** the hex field wraps to a second line, growing each row from 73 to 107 px.
- **Layer names (confirmed):** they get cut off in the 330 px layer column, e.g. "Shine sweep".
- **Speed (confirmed):** with 60 layers, selecting one takes about 260 ms because the whole editor rebuilds.
- **Import warnings:** they show as a 3,5 s green success toast, too short to read.
- **Long settings titles:** they truncate with no tooltip showing the full name.

## Low
About 30, listed in findings.md:
- **Panels:** collapse keys shared between modes, stale panel counts and titles, no hover or press feedback on panel toggles, and the collapse-all toggle misbehaving when there are no groups.
- **Motion:** reduced-motion doesn't cover the chevrons or row shifts, and Escape doesn't cancel a drag.
- **Copy:** "Could not…" wording and straight apostrophes.
- **CSS:** duplicate rules.
- **Palette and stops:** shares can sum to 99 or 101 %, there's no cap on palette colours, the stop arrow keys make one undo step per key press, and Add stop isn't disabled at the cap.
- **Focus:** lost when Undo disables itself, and when the mode switch rebuilds on undo.
- **Document structure:** no h1, an empty-state div inside a list, a stale aria-controls, and an empty aria-label on unlabelled selects.

## Coverage
| Surface | Viewports | Themes | Keyboard | Edge cases |
|---|---|---|---|---|
| Header | all | both | yes | rapid clicks |
| Static editor and stage | all | both | partly | stops cap, import warnings |
| Animated editor | all | both | yes | 60 layers, long names, 24 colours |
| Panels and groups | 1280, 1440 | dark | yes | collapse across renders and modes |
| Dialogs | 1280 | dark | yes | stacking, Escape |
| Exports | 1280 | dark | yes | Cancel, big-export confirm |

Questions: none new. The open ones from pass 1 keep their defaults: "Colour" spelling, "50%" format and no skill installs.

## Update: fixed (all verified in the browser unless noted)
- Rename commits in place on blur (no re-render; the click lands, focus stays); Escape cancels and refocuses the name.
- Shortcuts (Ctrl+Z/Y, Space) work with focus on sliders, checkboxes and colour inputs.
- Selecting a layer swaps only the settings column and row highlight: 4 ms with 60 layers (was 263 ms).
- A new selection reopens a collapsed settings panel; "Size and timing" keeps its collapsed state.
- One dialog per title; dialogs focus their first footer button (Cancel) when the body has nothing to focus; big-export title is now a question.
- Export Cancel lives in a fixed row, takes focus while rendering, is disabled during encoding, and focus returns to the export button; progress is announced in a polite status line.
- Removing a stop, palette colour or shadow keeps focus on the neighbouring remove button (or Add); stop arrow keys commit once after a pause and re-sort.
- Shadow controls are named per row; colour-field alpha is "<field> opacity"; panel counts update live.
- Drag: stops cleanly if the list is redrawn, Escape / lost pointer / window blur cancel, top auto-scroll zone starts below the sticky header.
- Import corrections show in their own toast that stays up longer for longer text; error copy uses "Couldn’t …"; curly apostrophes; clearer angle wording.
- Panel keys per mode; toggles have aria-controls, a full-title tooltip, hover and press feedback; settings title follows renames; collapse-all disables when there are no groups; collapsed Preview stops drawing.
- Palette shares always total 100 %; palette colours capped at 24; Add stop disabled at 32.
- Phones: palette rows keep swatch and hex on one line (share and opacity move under the strength). Mouse devices: row tools appear on hover, focus or selection so names have room.
- Headings: a visually hidden h1, h3 library categories; closed popovers drop aria-controls; unlabelled selects no longer get an empty aria-label; mode switch doesn't rebuild when the mode is unchanged; Undo hands focus to Redo (or Presets) when it disables itself.
- Reduced motion covers chevrons and row shifts; duplicate CSS rules merged; picture layers' images now load when a project is opened (they were skipped before).
