# uitest plan: cyex paints (2026-11-13)

Target: `cyex-paints.html` (bundle of index.html + css/ + js/), opened over file:// in the built-in browser pane.
Constraint from the user: no local ports, no installs. localStorage is blocked in the pane (data: snapshot), so persistence is checked by code reading.

## Surface map
- Header: brand link, mode segmented control (Static / Animated), Undo, Redo, Presets, theme toggle.
- Static editor: Paint panel (name, function seg, angle slider, shape seg, repeat checkbox, image URL), Colour stops (gradient bar with draggable handles, stop rows: colour picker, hex, position, opacity, remove; Add, Reverse, Spread, Palettes menu), Shadows (rows with X/Y/Blur sliders, colour, remove, drag grip; Add).
- Static stage: Preview (stagebox names + chat mock, preview name, name colour, backdrop seg), Export (code box JSON/CSS tabs + copy, Import JSON dialog, Download JSON, paint size fields, name size slider, Paint PNG, Name PNG, Animate this paint).
- Animated editor: Layers list (grip, thumb, name with dblclick rename, eye, duplicate, delete; Add layer, Add element), Effects list, Paint panel (name, size and timing group, recolour group), Shadows, Settings panel (groups by param, palette editor, stops editor, select, checkbox, text + emoji chips, image picker, transform, colour tweaks, reset, duplicate).
- Animated stage: preview with canvases, paint image canvas (drag to place), transport (play, scrub), Export (GIF, APNG, Frame PNG, Sprite sheet, Name GIF, GIF options, name size, hosted URL, code box 7TV JSON/Project, Save project, Open project).
- Dialogs: Library (search, category nav, cards), Presets (Static / Scenes / Animated effects), Import.
- Global: tooltips, toasts, drag-and-drop files, keyboard shortcuts (Ctrl+Z/Y, Space).

## Matrix
Viewports: 320×568, 375×812, 390×844, 430×932, 768×1024, 1024×768, 1280×800, 1440×900, 1920×1080, 2560×1440, landscape 844×390; zoom 200% approximated by 640×400.
Themes: dark, light. Preferences: reduced motion, forced colours and contrast by code review (pane cannot emulate them).
Input: mouse (synthetic events), keyboard (synthetic + focus order), touch via mobile preset.
Slices: (A) browser layout matrix, me; (B) functional + edge cases, me; (C) a11y/keyboard code review, agent; (D) cyex compliance + motion code review, agent.

## Limits
- The pane's screenshots are small, so the visual layout is judged by DOM measurement (overflow, overlap, clipping, sizes) more than by eye.
- No real downloads: anchor clicks are intercepted.
