# Hunt stylesheet

## 1. Purpose

`web/hunt.css` owns the scoped Hunt visual system, including role phase state, turn update cards, whale budget meters, action previews, whole-card board selection, expanded chart metrics, evidence lanes, reveal status cards, mobile layouts, focus targets, and reduced-motion behavior.

## 2. Relevant sections

- `.hunt-phase-state` and `.hunt-phase-toast` make turn ownership visible.
- `.hunt-budget-note` and `.hunt-footprint-preview__*` explain and visualize bounded whale actions.
- `.hunt-scan-lane` and `.hunt-selected-answer` make evidence questions and numeric answers scannable.
- `.hunt-reveal__scoreboard`, `.is-correct`, and `.is-missed` make the final catch state legible.
- Existing board and command panel rules preserve keyboard targets and mobile stacking.
