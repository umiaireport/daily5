# Daily Five stylesheet

## 1. Purpose

`web/daily-five.css` styles the Daily Five screen within the existing dark ocean visual system. The stylesheet owns the compact capital and round header, five candidate cards with visible colored chart snapshots, selected chart, clue grid, segmented allocation bar, leverage fields, decision workbench, contribution outcome reveal, final scorecard, share controls, focus treatment, and responsive layouts.

## 2. Responsive behavior

The desktop layout keeps five candidates in one row and places evidence beside the decision controls. At mobile widths the candidates become a horizontally scrollable tab row, clues use two columns, and the decision panel stays within the safe viewport as a sticky card. The 320px rule reduces spacing and text without hiding controls. Focus rings and reduced-motion rules are local to `.daily-five`.
