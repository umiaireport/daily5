# HuntScreen

## 1. Purpose

`web/hunt/HuntScreen.tsx` renders the Whale Hunt v2 entry and match journey from the role-filtered `HuntV2MatchView`. It does not calculate winners or read hidden target data.

## 2. Functions and components

- `formatRemaining` aligns the displayed countdown with the server clock sample.
- `MarketChart` draws public price traces, volume bars, and revealed pulses.
- `ScoreHeader` keeps Whale and Tracer scores, round marks, phase, and deadline visible.
- `ArenaBoard` and `WindowCard` render accessible A, B, and C choices.
- `WhaleControls` previews Burst, Drip, Blend, Decoy, or Late push and confirms Hide here.
- `EvidenceStrip` renders bounded, wrapping scan results beside the chart.
- `TracerControls` performs six evidence scans and explicit catch lock-in.
- `RoundReveal` explains caught, escaped, timeout, and rematch outcomes.
- `HuntScreen` owns polling, command metadata, error recovery, human open-seat joining, and role-swapped rematches.
