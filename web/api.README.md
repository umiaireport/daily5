# Browser API helper

## Purpose and functions

`web/api.ts` keeps browser requests same-origin, sends JSON for POST bodies, safely handles HTML/non-JSON deployment responses, parses controlled API errors, and returns typed JSON.

- `parseResponse` — `web/api.ts:1`: converts JSON errors and HTML responses into safe user-facing messages.
- `api` — `web/api.ts:18`: generic GET/POST helper used by the React shell, including a 15-second timeout.
