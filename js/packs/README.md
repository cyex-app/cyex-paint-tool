# Packs: how to add layers and effects

Each file in `js/packs/` adds a themed group of layers and effects. They load from `index.html` right after `js/more.js`, marked `data-engine`, so the export worker runs them too. Plain JS, no modules, no dependencies.

Check a pack without a browser:

```bash
node tools/check.js js/packs/<name>.js
```

It renders every item the pack adds and fails on NaN, a seam at the loop point, a blank or flat result, something that has a speed but doesn't move, an effect that changes nothing, missing tags or category, or a frame slower than 120 ms in Node (about 20 ms in a browser).

## The file

The stub already has the preamble: helper imports, `layer(id, def)`, `effect(id, def)` (both throw on a duplicate id) and the pack's categories. Write definitions below `// ---- definitions go here ----`.

- **ids:** camelCase, unique across the whole app. Saved paints store them, so never rename one once shipped.
- **Copy:** sentence case, no exclamation marks, British "colour", curly apostrophes (’). `desc` is one plain sentence on what it looks like and what the main controls do.
- **tags:** 4 to 8 lowercase words people might search for, including synonyms and the look's feel (for example `['water', 'ocean', 'ripple', 'blue', 'calm', 'liquid']`). Search and "similar" use them.

## Layers (per pixel)

```js
layer('rings', {
  name: 'Rings', cat: 'Geometric', desc: 'Concentric rings that pulse outward.',
  tags: ['circles', 'target', 'concentric', 'pulse', 'op art'],
  params: [P.pal('neon', true), P.range('count', 'Rings', 1, 40, 1, 12), P.speed(1)],
  prepare(p) { /* optional: precompute into p._something once per render */ },
  sample(u, v, t, p, o, c) {
    // u, v: 0..1 across the paint (pixel centres); c.A = width / height (a paint is about 4:1), c.W, c.H in pixels.
    // t: 0..1 over the loop. Write straight-alpha RGBA, 0..1, into o and return o.
    const d = Math.hypot((u - 0.5) * c.A, v - 0.5);
    return lutAt(p._stops, fract(d * p.count - t * p.speed), o);
  },
});
```

- A `palette` or `stops` param named `stops` is ready as a lookup table `p._stops`: `lutAt(p._stops, f, o)` writes the colour at f (0..1) into o. Another key `k` gets `p['_' + k]`.
- `colorPrep(['bg'])` as `prepare` gives `p._bg = [r, g, b]` (0..1) for a `P.color('bg', …)` param. To do more, call it inside your own prepare: `prepare(p) { colorPrep(['bg'])(p); … }`.
- Set `o[3]` (alpha) yourself when the layer has transparent parts. `lutAt` sets it from the palette.

## Effects (whole image)

```js
effect('crt', {
  name: 'CRT curve', cat: 'Lens and warp', desc: 'Bends the image like an old curved screen.',
  tags: ['crt', 'tv', 'bulge', 'retro', 'screen'],
  params: [P.range('amount', 'Curve', 0, 1, 0.01, 0.3)],
  run(buf, W, H, t, p, c) {
    // buf: Float32Array, straight-alpha RGBA 0..1, W x H. Change it in place and return it, or return a new one.
    return remap(buf, W, H, (x, y, s) => { /* write the source pixel position for (x, y) into s[0], s[1] */ s[0] = x; s[1] = y; });
  },
});
```

- `eachPx(buf, W, H, (i, u, v, x, y) => { … })` visits every pixel; `buf[i]` to `buf[i + 3]` are r, g, b, a.
- `remap` warps (bilinear, wraps at the edges); `bilinear(buf, W, H, x, y, out)` samples one point; `boxBlur(buf, W, H, r)` blurs fast (returns a new buffer).
- With defaults, an effect must visibly change a normal image.

## Params

`P.range(k, label, min, max, step, default, hint?)`, `P.int(k, label, min, max, default, hint?)`, `P.speed(default, k = 'speed', label = 'Speed', min = -8, max = 8)` (whole cycles per loop), `P.color(k, label, '#rrggbb')`, `P.select(k, label, [[value, 'Label'], …], default)`, `P.bool(k, label, default)`, `P.seed(default)`, `P.pal(paletteName, loop?)` (weighted palette; loop = true when the colours should wrap round), `P.stops(paletteName)`.

Palettes: rainbow fire ice icyLake gold chrome neon ocean toxic sunset pastel aurora galaxy lava sakura mono blood mint vapor ember rainbowLoop holo opal neonPop night dusk peaks candy.

## Rules that keep exports right

1. **Seamless loops.** Everything time-based must come back to the same state at t = 1 as at t = 0. Use whole cycles: `t * p.speed` with an integer speed inside `fract`, `sin(TAU * …)`, or as an offset on a circle (`cos(TAU * t * speed)`, `sin(TAU * t * speed)`). Never `t * 0.7`. Something that changes in whole steps on purpose (random flicker per frame) sets `stepped: true`.
2. **Deterministic.** No `Math.random` and no `Date`. Use `hash2(x, y, seed)` (0..1), `PL.rng(seed)` (in prepare), `vnoise`, `fbm(x, y, px, py, octaves, seed)` (tiles with period px, py: keep those whole numbers) and `ridged`.
3. **Fast.** A 256 x 64 frame runs for every frame of an export. Precompute in `prepare`, avoid allocating per pixel, keep fbm octaves low.
4. **Tiles sideways when it can.** Paints stretch over a name, and layers can scroll. Prefer patterns that repeat across u = 0..1 (whole-number counts across the width).
5. **Stays in range.** Clamp colours to 0..1, and never divide by something that can be 0.
