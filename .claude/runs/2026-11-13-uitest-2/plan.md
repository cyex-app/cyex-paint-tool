# uitest pass 2: cyex paints (2026/11/13), after fixes, proposals and the js/app/ split

Target: cyex-paints.html over file:// in the built-in browser pane (data: snapshot; localStorage blocked there, persistence reviewed in code).
Surface map: as in ../2026-11-13-uitest/plan.md, plus new: collapsible panels (every header), groups toggle (one button), palette strengths, stop cap (32), thumbnail cache, drag auto-scroll, export snapshot / Cancel / big-export confirm, import sanitising and warnings, layer name buttons (Enter, F2, Delete).

Matrix: 320×568, 375×812, 390×844, 430×932, 768×1024, 1024×768, 1280×800, 1440×900, 1920×1080, 2560×1440, 844×390, zoom 200% approximated by 640×400. Dark and light. Keyboard via synthetic events, touch via mobile preset. Reduced motion, forced colours, contrast by code review.

Slices: (A) layout matrix, me; (B) functional regression + new features, me; (C) edge cases and keyboard, me; (D) a11y, keyboard and behaviour code review of js/app/* and ui.js, agent; (E) cyex spec, motion and break-ui code review of new UI, agent.
