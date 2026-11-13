# Changes (all on main)

| Commit | What | Checks |
|---|---|---|
| ff11bcc | Baseline before fixes | build |
| 80c1db4 | Groups collapse again; every panel collapsible with Collapse/Expand all; CSS polish (targets, hover gating, :active, forced colours, phone header, toast side, labels) | build, browser collapse probe, viewport audit |
| 8afd938 | Keyboard and screen-reader fixes (focus restore, listbox ARIA, Space guard, reorder focus, dialog keys, toasts) | build, keyboard probes |
| c6a3e26 | Harden load/import (sanitizeDoc, safe boot, unknown types reported), safe image URLs, redo, project preview, frame cache cap, reduced-motion start | build, injection and bad-JSON probes, 0 console errors |
| d3736ed | Safe exports: snapshot, single export, Cancel, big-export confirm, empty guard, sprite grid | build, export probes (GIF, APNG, sheet, cancel, mid-export edit) |
| 24fc043 | Loop seams (Scales, skyline), emoji graphemes, explicit drag targets, mountains LUT, palette zero hint | build, seam test Δ0, all layers/effects/presets render |
| (last) | Layer names as buttons (Enter, F2, Delete); hidden duplicate preview names; narrow-panel rows | build, keyboard probe, 320/375/1440/2560 audit |
