# Daily Five recovery and progress

## 1. Purpose and behavior

Owns persisted start keys, resume, mode, request state and serialized commands. Transient resume failures never start another attempt. Missing/forbidden records offer an explicit new attempt; the server decides official versus practice. Start keys are stored before sending and reused after a lost response. Replayed starts are followed by resume to avoid old snapshots. Each request has a 15-second deadline; an action can make one further bounded resume request to reconcile a lost reply. Generation guards ignore results after unmount. Countdown updates stay local to RequestProgress.

## 2. Code sections

Storage and validation; lifecycle hook; command recovery; isolated countdown.

## 3. Functions and checks

- `readStoredAttempt` — `web/daily-five/journey.tsx:26`.
- `writeStoredAttempt` — `web/daily-five/journey.tsx:41`.
- `errorMessage` — `web/daily-five/journey.tsx:49`.
- `requirePlayableAttempt` — `web/daily-five/journey.tsx:56`.
- `useDailyFiveJourney` — `web/daily-five/journey.tsx:71`.
- `request` — `web/daily-five/journey.tsx:85`.
- `report` — `web/daily-five/journey.tsx:91`.
- `load` — `web/daily-five/journey.tsx:99`.
- `reconnect` — `web/daily-five/journey.tsx:171`.
- `startFresh` — `web/daily-five/journey.tsx:177`.
- `act` — `web/daily-five/journey.tsx:190`.
- `RequestProgress` — `web/daily-five/journey.tsx:256`.
- `timer` — `web/daily-five/journey.tsx:261`.
