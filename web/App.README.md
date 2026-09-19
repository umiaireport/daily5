# React application shell

## Purpose and sections

`web/App.tsx` owns session/round/result state, navigation between arena/leaderboard/live views, API loading, clue unlock and choice lock actions, daily-entry locking, reset flow, error/loading states, and the page composition.

## Functions

- `App` — `web/App.tsx:24`: renders the full Whale Arena shell and view states.
- `refreshDaily` — `web/App.tsx:42`: loads the public daily challenge and this session's official entry.
- `load` — `web/App.tsx:53`: creates/resumes session, loads live status, daily state, and the current round/result.
- `navigate` — `web/App.tsx:81`: loads leaderboard or live/daily status content.
- `unlock` — `web/App.tsx:102`: posts a clue unlock and returns its content.
- `lock` — `web/App.tsx:117`: posts an immutable tutorial allocation and refreshes session state.
- `lockDaily` — `web/App.tsx:132`: posts the one immutable daily allocation and reloads its pending result.
- `continueGame` — `web/App.tsx:145`: advances or resets after a reveal.
