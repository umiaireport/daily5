# Milestone 4 — Daily interface and sharing

## 1. Prompt and ownership

Read [shared rules](01-shared-rules.md). Own `web/daily-five/*`, `web/daily-five.css`, `web/api/daily-five.ts`, `web/share/daily-five.ts`, and `tests/daily-five-ui.spec.ts`. Depends on daily contracts, engine, and visual primitives. Run alongside milestones 5 and 6.

## 2. Quick play layout

Optimize returning-player play for roughly 60–90 seconds without a timer, speed score, mandatory tutorial, repeated confirmations, narration, or separate chart pages. This is a usability target, not a claim proved by scripted fast clicks.

Desktop: compact capital/round header; five asset cards in one row; selected chart and six clues beneath; trade controls alongside; one primary lock action.

Mobile: compact capital/round header; five asset tabs in one row; selected chart; two-column clue grid; inline latest clue answer; sticky direction/leverage/submit controls. Keep controls within safe viewport space without hiding content.

Switching assets preserves purchased clues and draft controls. Display three clue credits. The player need not use them all.

## 3. Copy and controls

| Clue | Locked question |
| --- | --- |
| Flow | Who is pressing harder: buyers or sellers? |
| Crowd | Is participation spreading? |
| Whale footprint | Is the activity concentrated? |
| Volume | Does volume support this move? |
| Volatility | How unstable has the path been? |
| Absorption | Is pressure producing much price movement? |

Answers use one short headline, up to two metrics, and an expandable explanation. Avoid navigation through multiple modals.

Leverage presets are 1×, 5×, 10×, 25×, 50×, 100× plus accessible integer input. Default to 1×; never automatically increase it between rounds. Show $10,000 stake, exposure, and approximate liquidation distance under the game rules. Primary action is “Lock $10,000 trade”; provide cash explicitly.

## 4. Immediate reveal

Lock controls, receive the saved result, display final ticket equity immediately, then optionally animate the actual path for at most 600ms. Show one factual explanation and “Next trade.” Animation is skippable/reduced-motion compatible and never delays the numerical result.

Distinguish earlier evidence, later outcome, and why this position profited, lost, or liquidated. Do not claim an earlier signal guaranteed the result. Show the revealed asset identity for the completed case only.

Final view: starting $50,000, final equity/return, five outcome symbols, directional accuracy, liquidation count, exact-variant comparison where available, share, and challenge friend.

## 5. Sharing

```text
WHALE ARENA · DAILY FIVE #042
🟩 🟥 💥 🟩 🟩
$50,000 → $74,100
+48.2% · 4/5 directions

Different assets. Same daily challenge.
```

Generate all values from saved results. Support copy text, PNG download, and native sharing where available. Exclude token names, directions, clues, private seeds, and answer mappings. Use the comparable-variant friend flow; do not promise a different pack if none is available. Exact-case practice must be labeled.

## 6. Acceptance

- Every submission gets an immediate historical result.
- Reload restores the current round or unacknowledged reveal.
- First official attempt and practice are distinct.
- Share output uses saved server results and reveals no answers.
- Mobile and keyboard users can inspect clues and place trades without repeated modal navigation.
- The final connected journey uses real application services, not mocks.
