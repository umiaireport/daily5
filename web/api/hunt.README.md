# Hunt transports

## 1. Purpose

`web/api/hunt.ts` remains the compatible v1 transport. `web/api/hunt-v2.ts` transports the redesigned v2 match without exposing HTTP details to the screen.

## 2. Hunt v2 functions

- `HuntV2ApiError` carries structured server failure and state metadata.
- `requestJson` serializes same-origin JSON requests and parses structured errors.
- `createHuntV2ApiTransport` implements match creation, human open-seat joining, view refresh, commands, and role-swapped rematch calls.
