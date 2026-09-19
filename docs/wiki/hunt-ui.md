# Hunt v2 arena UI

## 1. Entry and match

`web/hunt/HuntScreen.tsx` starts a versioned Whale or Tracer match against a computer and polls the server-owned view. The entry screen explains each role and the first-to-three format. The active screen keeps both scores, round number, phase, deadline, role objective, and reserved action space visible.

## 2. Arena sections

- `ScoreHeader` shows Whale–Tracer scores and resolved round marks.
- `ArenaBoard` and `WindowCard` render the three labeled chart windows with price traces and volume bars.
- `WhaleControls` provides immediate local zone and five-action move feedback, private preview copy, and the explicit Hide here confirmation.
- `TracerControls` provides six evidence scans, the bounded evidence strip, target selection, and Lock catch confirmation.
- `WindowCard` shows the live symbol, chain, and public Smart Money direction when live mode supplies market context.
- `RoundReveal` shows the hidden zone, selected zone, decisive explanation, winner, point, and role-swapped rematch.
- `HuntScreen` owns polling, retry copy, server-aligned countdown rendering, and command dispatch.

## 3. Accessibility and responsive behavior

The chart is readable at desktop and narrow widths. On phones the windows stack before evidence and controls. Buttons provide text labels, keyboard focus, 44px interaction targets, and explicit pressed states. Result announcements use an assertive live region. Reduced motion is handled in `web/hunt.css`; no fixed overlay covers the chart or action area.
