# cyex paints

A local editor for 7TV name paints. No server, no install, nothing uploaded.

**Open:** double-click `cyex-paints.html` (one self-contained file). `index.html` also works and loads the separate files in `css/` and `js/`.

**Rebuild the single file after editing the sources:**

```bash
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

## Static paints

Mirrors the 7TV paint format (`LINEAR_GRADIENT`, `RADIAL_GRADIENT`, `URL`; repeat, angle, shape, stops, drop shadows).
The preview uses exactly the CSS the 7TV extension builds (`createGradientFromPaint` in SevenTV/Extension):
`background-color: currentcolor`, the gradient clipped to the text, shadows as `drop-shadow()` filters.
Colours are 7TV's signed 32-bit RGBA integers: `(r << 24) | (g << 16) | (b << 8) | a`.

Exports: 7TV JSON, CSS, paint PNG, painted-name PNG. Import accepts 7TV JSON (integers or hex colours).

## Animated paints

Animated 7TV paints are `URL` paints pointing at an animated image, which 7TV stretches over the name (`background-size: 100% 100%`).
Build one from layers, scene elements and effects, then export GIF or APNG, host it, paste the link, and copy the JSON.

- **Scene elements (7):** shapes (heart, star, moon, striped sun, planet, crown, note, cloud, orb and more), text and emoji, your own pictures,
  ribbons, mountains, a city skyline, lightning. Each can be copied (row, grid, scatter, ring) and animated
  (float, bounce, sway, orbit, figure eight, wander, drift, rise, fall, A to B) with spin, pulse and fade.
- **Layers (46):** gradients incl. mesh gradient, patterns, noise and fluids, particles and light, materials.
- **Effects (38):** colour, lighting and 3D shape, distortion, texture.
- **Colours:** effects use weighted palettes. Every colour has a strength slider that sets its share of the whole,
  plus smoothness and loop. Every layer also has colour tweaks (hue, saturation, brightness, contrast, tint),
  and the Paint panel can recolour everything at once.
- **Drag and drop:** reorder layers, effects, palette colours and shadows by their grip (or Alt+Up/Down);
  drag on the paint image to place the selected element (Shift-drag sets point B for "Move from A to B");
  drop image files on the page to add them as elements, or a .json to open it.
- **Presets:** 12 static, 17 scenes, 24 animated effects.

All motion uses whole cycles per loop, so every export loops without a seam.
Exports: GIF (own encoder, 64–256 colours, optional dither), APNG, frame PNG, sprite sheet, animated name GIF, project file.

Not affiliated with, endorsed by, or sponsored by 7TV or Twitch.
