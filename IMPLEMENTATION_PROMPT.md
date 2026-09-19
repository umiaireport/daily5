# Daily5 standalone app — implementation brief

Build a standalone project in `~/hekatlon/hackathlon/daily5` by extracting and adapting the Daily Five experience from Whale Arena.

## Product boundary

- This project is Daily5 only. Do not expose Whale Hunt or the old multi-game arena in the navigation.
- Keep the existing Daily Five research surface, five asset cards, charts, clues, allocation controls, reveal, and scorecard language as the visual foundation.
- Official Daily Five is one immutable five-round challenge per UTC day.
- After a player completes the official challenge, the final result page must say that today’s challenge is complete and “Try again tomorrow.”

## Practice Arena

- Add a separate Practice Arena route using the same cards and gameplay controls.
- Each practice start creates a new one-round board containing five randomly selected assets from the Nansen-backed pool when provider data is configured.
- If Nansen is not configured, use a clearly labelled synthetic fallback; never pretend fallback data is live.
- Practice is exactly one round, can be replayed, and has no daily leaderboard entry.

## Identity and records

- Require a simple account login before play. The demo account is `demo` / `demo`.
- Store the authenticated user in an HTTP-only cookie and keep game state server-owned.
- Provide an account/history view showing the user’s completed official results, with the latest played day first.
- Once a UTC day rolls over, that day’s official case pack and leaderboard become immutable/frozen. New players enter only the new day.
- Provide an all-time leaderboard capped at the top 100 official results across all days.
- Practice results never enter either leaderboard.

## Delivery requirements

- Keep `daily5` independently installable, runnable, type-checkable, and buildable.
- Document the new routes, login demo, Nansen configuration, fallback behavior, and verification commands.
- Preserve server-side validation, idempotency, state-version checks, and reveal-only asset identities from the source Daily Five implementation.
- Verify with typecheck and production build; add focused tests for practice one-round completion, auth, frozen daily boundaries, history, and all-time ranking where practical.
