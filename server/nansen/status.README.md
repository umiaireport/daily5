# Provider availability status

## Purpose and functions

`server/nansen/status.ts` gives the API/UI a consistent honest state when synthetic mode is selected or live collection cannot be enabled.

- `providerStatus` — `server/nansen/status.ts:1`: returns `available: false` and explains whether a key/configuration is missing or live mode is opt-in.
