# Milestone 3 — Shared visual system

## 1. Prompt and ownership

Read [shared rules](01-shared-rules.md). Own `web/game-ui/*`, `web/game-ui.css`, and specifically named component visual tests. Work against frozen contracts in parallel with milestones 1 and 2. Do not edit global routing.

## 2. Design language

Continue the existing ocean arcade design: background `#0b1016`, panels `#121a23`, borders `#25303b`, text `#e7edf0`, mint interaction accent `#69ddbb`, loss color `#f09e9d`. Add blue, violet, amber, and cyan asset accents. Asset colors identify cards, not winners.

Use inline SVG/CSS for charts, whale silhouettes, sonar marks, evidence icons, badges, and connectors. Reuse the existing whale mark where suitable. No stock photography, video background, or remote font dependency.

## 3. Components

Create `AssetMiniCard`, `PriceChart`, `ClueTile`, `CluePanel`, `ClueBudget`, `DirectionToggle`, `LeverageControl`, `CapitalSummary`, `RoundProgress`, `EvidencePin`, `PlayerSeat`, `SourceLabel`, and `OutcomeStrip`.

Provide loading, empty, unavailable, selected, locked, and revealed states. Components consume only the public information available in their phase.

Charts normalize hidden assets to a starting index of 100 for display, without changing settlement. Use a consistent percentage scale across the five daily cards so small moves do not appear as large as major moves. Show a decision cutoff divider on result charts; subdued prior series and stronger revealed outcome series. Do not smooth curves into invented liquidation extrema. Mark actual evaluated liquidation candles.

Clue categories have both icons and plain-language labels. Locked clues show generic questions; unlocked clues show facts. Unopened cards do not use bullish/bearish answer hints.

## 4. Interaction and responsiveness

- Minimum 44px touch targets and visible keyboard focus.
- Text/icons supplement color.
- No hover-only information.
- Avoid layout shifts when clues open.
- Respect `prefers-reduced-motion`.
- Short transitions; no mandatory cinematic sequences.
- Namespace under `.daily-five`, `.whale-hunt`, and `.game-ui`.

Target 390×844 and 1440×900; verify no overflow at 320px. Mobile uses a selected-asset detail view, not a scaled-down desktop board.

## 5. Acceptance

All components are keyboard-usable, support specified states, and render without future/hidden data. Charts communicate comparable magnitude and honest cutoffs. Existing screens retain their visual behavior.
