# Browser API helper

## Purpose and functions

`web/api.ts` keeps browser requests same-origin, sends JSON for POST bodies, parses controlled API errors, and returns typed JSON.

- `api` — `web/api.ts:1`: generic GET/POST helper used by the React shell, including a 15-second timeout.
