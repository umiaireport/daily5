# Arena screen

## Purpose and sections

`web/components/Arena.tsx` renders mystery-token cards, clue buttons, allocation sliders, cash reserve, lock confirmation, and clue/cash dialogs. It keeps temporary allocation/modal state while the server owns unlock and lock decisions.

## Functions

- `Arena` — `web/components/Arena.tsx:12`.
- `adjust` — `web/components/Arena.tsx:26`: transfers percentage points between an asset and cash.
- `openClue` — `web/components/Arena.tsx:35`: reopens a known clue or asks the parent to unlock it.

The screen labels the source as either synthetic/Base tutorial or Nansen live signal and timestamps live clue observations.
