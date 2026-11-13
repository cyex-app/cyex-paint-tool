# improve plan: cyex paints (2026/11/13)

Stack: plain HTML/CSS/JS, global PL namespace, no package manager, no tests. build.ps1 bundles into cyex-paints.html.
Not a git repository -> per deep-improve's safety net: audit and report only, no source changes. Ask at the end whether to init git.

Baseline checks (no test suite exists):
- build.ps1: passes (bundle built).
- Browser smoke (file:// in the pane): 53 layers + 38 effects render, 41 presets render, GIF/APNG decode, 0 console errors (from the uitest run today).

Auditors: improve, thermo-nuclear-code-quality-review, improve-codebase-architecture and codebase-design are not installed here.
Coverage instead: (1) general code-quality agent covering bugs, performance, security, maintainability and architecture; (2) improve-animations + break-ui agent. Plus the verified uitest findings.
