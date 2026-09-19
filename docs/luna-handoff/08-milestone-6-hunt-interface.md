# Milestone 6 — Detective arena interface

## 1. Prompt and ownership

Read [shared rules](01-shared-rules.md). Own `web/hunt/*`, `web/hunt.css`, `web/api/hunt.ts`, and `tests/hunt-ui.spec.ts`. Work alongside milestone 5 using frozen contract fixtures, then connect the actual hunt service. Mocks do not satisfy final completion.

## 2. Entry and lobby

Entry offers two role cards:

- Whale: “Build your position. Leave them chasing the wrong trail.”
- Tracer: “Read the footprints. Find the hidden targets.”

Mode selector: Duel or Crew Hunt. Primary action: “Find a match.” Secondary action: “Play computers now.”

Lobby shows one whale seat and one or five tracer seats. Human seats show aliases; empty seats show neutral sonar outlines; bots explicitly say “Computer.” Copy: “Finding players… computers join in 8 seconds.” Do not fabricate human presence or online counts.

## 3. Board and role views

Desktop board uses six asset locations in a two-by-three grid, faint ocean contours, and short connectors. Each card has a small real background chart, activity band, and evidence markers. Selecting a location opens details. Avoid dozens of dense statistics on the main board.

Whale sees secret targets, primary 0/8 and secondary 0/4 progress, remaining purchase/decoy budgets, asset/units/style controls, and a preview of its simulated footprint. It does not see private suspicions or future background.

Tracer sees scan credits, investigation choices, evidence pins, two suspect slots, and “Finish investigating.” Team mode shares evidence and structured pings: Investigate, Likely target, Possible decoy. Free-text chat is not required.

Mobile uses selectable locations plus details, not a tiny scaled map. Role objective remains visible without opening help.

## 4. Graphics and reveal

- Burst: one short expanding ring.
- Drip: a few small sequential pulses.
- Decoy: indistinguishable from normal activity to opponents during play; identified only after reveal.
- Scan: brief sweep on the chosen card.
- Evidence pin: compact icon and numbered badge.

Animations must follow role-filtered visible events. Hidden action style cannot leak through animation, timing metadata, or DOM attributes.

Final reconstruction reveals both targets, five-round accumulation, whale actions, tracer investigations, and a deterministic explanation of the decisive inference or distraction. Show score, badges, rematch, and swap roles. Make animation skippable and reduced-motion compatible.

## 5. Acceptance

Objectives are understandable from the screen; computers are clearly labeled; no visual leaks before reveal; recorded events support explanations; keyboard/mobile controls work; connected service supports a complete match and refresh recovery.
