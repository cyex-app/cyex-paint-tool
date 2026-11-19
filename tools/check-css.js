/* Checks the two CSS builders without a browser:  node tools/check-css.js
   Loads core.js and paint.js, then compares PL.decToCss and PL.Paint.gradientCss with the outputs saved in
   tools/css-fixture.json (colour integers and paint definitions, each with the CSS it must produce).
   Prints the number of cases compared and exits 1 on any difference. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');

const ctx = { console, Math, JSON, Number, String, Array, Object, Map, Set, Symbol, Error, URL, encodeURIComponent, Float32Array, Float64Array, Uint8Array, Uint8ClampedArray, Int32Array, Uint32Array, Uint16Array };
ctx.window = ctx; ctx.self = ctx; ctx.PL = {}; ctx.window.PL = ctx.PL;
vm.createContext(ctx);
for (const f of ['js/core.js', 'js/fx.js', 'js/paint.js']) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
const PL = ctx.PL;

// Colour inputs JSON can't hold are stored as { t: 'undef' | 'null' | 'nan' | 'inf' | '-inf' }.
const special = { undef: undefined, null: null, nan: NaN, inf: Infinity, '-inf': -Infinity };
const decodeIn = (x) => (x && typeof x === 'object' ? special[x.t] : x);

const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'css-fixture.json'), 'utf8'));
let bad = 0;
const fail = (what, input, want, got) => { if (bad++ < 20) console.log(`DIFF ${what}\n  in:   ${JSON.stringify(input)}\n  want: ${want}\n  got:  ${got}`); };
for (const [input, want] of fx.dec) { const got = PL.decToCss(decodeIn(input)); if (got !== want) fail('decToCss', input, want, got); }
for (const [paint, want] of fx.grad) { const got = PL.Paint.gradientCss(JSON.parse(JSON.stringify(paint))); if (got !== want) fail('gradientCss', paint, want, got); }
const total = fx.dec.length + fx.grad.length;
console.log(`${total - bad}/${total} cases equal (${fx.dec.length} decToCss, ${fx.grad.length} gradientCss)`);
process.exit(bad ? 1 : 0);
