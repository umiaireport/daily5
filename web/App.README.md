# React application shell

## Purpose and sections

`web/App.tsx` owns account login/registration, session/round/result state, navigation between arena/leaderboard/live views, API loading, clue unlock and choice lock actions, daily-entry locking, reset flow, error/loading states, and page composition.

## Functions

- `Login` — `web/App.tsx:70`: switches between login and account creation while preserving the demo path.
- `App` — `web/App.tsx:262`: renders the Daily5 shell and view states.
- `leaderboardWindow` — `web/App.tsx:26`: keeps the top ten plus the signed-in player's nearby scores within the 21-row view.
- `viewFromHash` — `web/App.tsx:45`: restores the selected shell view from the URL hash.
- `loadRecords` — `web/App.tsx:293`: loads account history, all-time scores, today’s challenge, and today’s leaderboard.
- `navigate` — `web/App.tsx:286`: changes the shell view and resets transient errors.
- `logout` — `web/App.tsx:316`: signs out through the server session endpoint.
