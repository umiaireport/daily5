# Daily5 usage

## Local flow

1. Start the app with `npm run dev` from `app/`.
2. Open `http://127.0.0.1:8311`.
3. Sign in with `demo` / `demo`, or create a local account.
4. Choose Practice or Daily Five.
5. Open up to two clues across the round, allocate the virtual wallet, and lock the decision.
6. Review the reveal, signed return, liquidation state when applicable, and clue explanations.
7. Continue through the five-round session and inspect history or the official leaderboard.

## Data modes

Synthetic mode is explicit and safe for development. Live mode uses the saved Nansen provider pack and shows provider attribution in the app. The app never places real trades.

Practice can be replayed and does not affect the official leaderboard. Daily Five is the official five-round challenge and keeps its saved result available after the day changes.
