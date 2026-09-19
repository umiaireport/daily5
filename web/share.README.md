# Scorecard export

## Purpose and functions

`web/share.ts` renders a self-contained 1200×630 canvas scorecard and triggers a local PNG download. It uses fictional/synthetic wording and does not upload or publish the image.

- `downloadScorecard` — `web/share.ts:4`: creates, encodes, downloads, and revokes the scorecard blob URL.
