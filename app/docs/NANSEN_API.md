# Nansen API integration

Daily5 keeps the Nansen key on the server. The browser receives normalized game evidence, never the provider credential.

## Configuration

Set these values in `app/.env`:

```text
DATA_MODE=live
NANSEN_API=your-server-side-key
DAILY_FIVE_PROVIDER_SNAPSHOT=./data/daily-five-provider-demo.json
```

`NANSEN_API` is the only provider key setting. The key stays on the server and is never sent to the browser.

The app does not impose a default credit budget. If an operator wants a local request guard, they may set `NANSEN_CREDIT_BUDGET` to an integer; otherwise it remains unset.

## Provider pack

In live mode, the app discovers the current provider-ranked asset universe and collects a new Daily Five pack when the current UTC day has no saved snapshot:

```text
DATA_MODE=live npm run download:daily-five
```

The pack is saved under `app/data/` and reused for the remainder of that UTC day. On the next UTC day, live startup or the collector creates a new pack and writes the new same-day snapshot. Practice selects a fresh random one-round board from the available provider pool.

## Boundaries

- Provider requests are server-side. An application request guard is available only when explicitly configured.
- Stablecoins, invalid rows, incomplete coverage, and future observations are rejected.
- Clues expose observed evidence before the player locks an allocation; later outcome fields remain private until reveal.
- The app is a research game with virtual balances, not a trading or execution product.
