/* Checks layers and effects without a browser: node tools/check.js [js/packs/x.js ...]
   Loads the engine scripts from index.html (the ones marked data-engine), then for every per-pixel
   layer and every effect (or only those a given pack file adds) checks:
     - no NaN or out-of-range values, and the default params survive sanitising
     - the loop is seamless (t = 0 and t = 1 render the same)
     - the frame isn't blank, and it changes over time when it has a speed
     - speed: a 256x64 frame (an effect's own share) should take under 120 ms here, about 20 ms in a browser, about 15 ms in a browser
   Canvas-drawn layers (scene elements) are skipped: Node has no canvas. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const engine = [...html.matchAll(/<script src="([^"]+)" data-engine><\/script>/g)].map((m) => m[1]);
const packs = process.argv.slice(2).map((p) => p.replace(/\\/g, '/'));

const ctx = { console, Math, Date, JSON, Float32Array, Float64Array, Uint8Array, Uint8ClampedArray, Int32Array, Uint32Array, Uint16Array, Map, Set, WeakMap, Array, Object, Number, String, Symbol, Error, TypeError, RangeError, Promise, performance, setTimeout, clearTimeout, TextEncoder };
ctx.window = ctx; ctx.self = ctx; ctx.PL = {}; ctx.window.PL = ctx.PL;
ctx.ImageData = class { constructor(w, h) { this.width = w; this.height = h; this.data = new Uint8ClampedArray(w * h * 4); } };
vm.createContext(ctx);
const load = (f) => vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });

// ids each named pack file adds (packs not yet in index.html load after the engine)
const added = { L: new Set(), E: new Set() };
const loadTracked = (f) => {
  const L0 = new Set(Object.keys(ctx.PL.LAYERS || {})), E0 = new Set(Object.keys(ctx.PL.EFFECTS || {}));
  load(f);
  if (packs.includes(f)) { for (const k of Object.keys(ctx.PL.LAYERS)) if (!L0.has(k)) added.L.add(k); for (const k of Object.keys(ctx.PL.EFFECTS)) if (!E0.has(k)) added.E.add(k); }
};
for (const f of engine) loadTracked(f);
for (const f of packs) if (!engine.includes(f)) loadTracked(f);

const PL = ctx.PL, E = PL.Engine;
const layerIds = packs.length ? [...added.L] : Object.keys(PL.LAYERS), effectIds = packs.length ? [...added.E] : Object.keys(PL.EFFECTS);
const W = 96, H = 24;
const docFor = (kind, id) => {
  const d = E.blankDoc();
  if (kind === 'L') d.layers = [E.newLayer(id)];
  else { d.layers = [E.newLayer('clouds'), E.newLayer('stripes', { blend: 'overlay', opacity: 0.5 })]; d.effects = [E.newEffect(id)]; }
  return d;
};
const maxDiff = (a, b) => { let m = 0; for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i])); return m; };
// Node in a vm runs this engine about 6x slower than a browser: 120 ms here is about 20 ms there,
// the cost of the heaviest built-in layers (Starfield, Flow noise)
const LIMIT = 120;
const baseMs = (() => { const cp = E.compile(Object.assign(docFor('E', Object.keys(PL.EFFECTS)[0]), { effects: [] })); E.renderBuf(cp, 0, 256, 64); const t0 = performance.now(); for (let k = 0; k < 3; k++) E.renderBuf(cp, k / 7, 256, 64); return (performance.now() - t0) / 3; })();
const STEPPED = new Set(['L:matrix', 'L:truchet', 'L:lightning', 'L:skyline', 'E:glitch', 'E:grain', 'E:vhs', 'E:invert']); // as in js/tests.js
// built-ins that fail a rule on purpose: Image needs a picture, Adjust starts neutral, Glitch is random per step
const EXPECTED = new Set(['L:image', 'E:adjust', 'E:glitch']);
let bad = 0;
const rows = [];
function check(kind, id) {
  const def = kind === 'L' ? PL.LAYERS[id] : PL.EFFECTS[id];
  const problems = [];
  if (kind === 'L' && def.draw && !def.sample) return; // canvas layer: needs a browser
  if (EXPECTED.has(kind + ':' + id)) return;
  if (!def.name || !def.desc || !def.cat) problems.push('missing name, desc or cat');
  if (packs.length && (!Array.isArray(def.tags) || def.tags.length < 3)) problems.push('needs 3+ tags');
  if (kind === 'L' && !(PL.LAYER_CATS || []).includes(def.cat)) problems.push(`category "${def.cat}" is not in PL.LAYER_CATS`);
  if (kind === 'E' && !(PL.EFFECT_CATS || []).includes(def.cat)) problems.push(`category "${def.cat}" is not in PL.EFFECT_CATS`);
  try {
    const raw = docFor(kind, id), { doc, dropped } = E.sanitizeDoc(JSON.parse(JSON.stringify(raw)));
    if (dropped) problems.push('dropped by sanitizeDoc');
    const cp = E.compile(doc);
    const a = E.renderBuf(cp, 0, W, H), b = E.renderBuf(cp, 1, W, H), m = E.renderBuf(cp, 0.37, W, H);
    for (const buf of [a, b, m]) for (let i = 0; i < buf.length; i++) if (!Number.isFinite(buf[i])) { problems.push('NaN or Infinity in output'); break; }
    const seam = maxDiff(a, b);
    if (seam > 0.02 && !def.stepped && !STEPPED.has(kind + ':' + id)) problems.push(`loop seam jump ${seam.toFixed(3)} (set stepped: true only if it changes in whole steps on purpose)`);
    let lo = 1, hi = 0; for (let i = 3; i < m.length; i += 4) { lo = Math.min(lo, m[i - 3] + m[i - 2] + m[i - 1]); hi = Math.max(hi, m[i - 3] + m[i - 2] + m[i - 1]); }
    let alpha = 0; for (let i = 3; i < m.length; i += 4) alpha += m[i];
    if (kind === 'L' && alpha < 0.5) problems.push('almost fully transparent');
    if (kind === 'L' && hi - lo < 0.02 && id !== 'solid') problems.push('flat: no visible pattern');
    const hasSpeed = def.params.some((p) => /speed|cycles|drift|rate/i.test(p.k) && p.d);
    if (hasSpeed && maxDiff(a, m) < 0.002) problems.push('has a speed but does not move');
    if (kind === 'E') { const base = E.renderBuf(E.compile(Object.assign(docFor(kind, id), { effects: [] })), 0.37, W, H); if (maxDiff(base, m) < 0.002) problems.push('effect changes nothing with default params'); }
    const t0 = performance.now(); for (let k = 0; k < 3; k++) E.renderBuf(cp, k / 7, 256, 64); const ms = (performance.now() - t0) / 3 - (kind === 'E' ? baseMs : 0);
    if (ms > LIMIT) problems.push(`slow: ${ms.toFixed(1)} ms per 256x64 frame (limit ${LIMIT} here)`);
    rows.push(`${problems.length ? 'FAIL' : 'ok  '} ${kind}:${id.padEnd(18)} ${ms.toFixed(1).padStart(5)} ms  seam ${seam.toFixed(3)}${problems.length ? '  ' + problems.join('; ') : ''}`);
  } catch (e) { problems.push('threw: ' + e.message); rows.push(`FAIL ${kind}:${id}  ${problems.join('; ')}`); }
  if (problems.length) bad++;
}
for (const id of layerIds) check('L', id);
for (const id of effectIds) check('E', id);
console.log(rows.join('\n'));
console.log(`\n${layerIds.length} layers, ${effectIds.length} effects checked, ${bad} with problems.`);
process.exitCode = bad ? 1 : 0;
