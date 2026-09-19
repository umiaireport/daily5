# Whale Hunt interface

## 1. Purpose

The `web/hunt/` module mounts the versioned Hunt v2 arena. It keeps role-specific selections and server transport separate from rule evaluation.

## 2. Files

- `HuntScreen.tsx` contains the entry state, solo start and human join controls, score header, three-window arena, whale deck, tracer toolkit, evidence strip, reveal, reconnect message, and rematch.
- `index.ts` exports the screen and public UI types.
- `../hunt.css` scopes layout, role colors, chart visuals, responsive flow, focus states, and reduced-motion behavior beneath `.whale-hunt`.
