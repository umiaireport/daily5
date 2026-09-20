# Nansen API integration

Daily5 keeps the Nansen key on the server. The browser receives normalized game evidence, never the provider credential.

## Configuration

Set these values in `app/.env`:

```text
DATA_MODE=live
NANSEN_API=your-server-side-key
NANSEN_CREDIT_BUDGET=10
DAILY_FIVE_PROVIDER_SNAPSHOT=./data/daily-five-provider-demo.json
```

`NANSEN_API2` and `NANSEN_API_KEY` remain supported as legacy aliases, but `NANSEN_API` takes precedence.

## Provider pack

Run the collector only when live data is authorized:

```text
DATA_MODE=live DAILY_FIVE_DOWNLOAD=true npm run download:daily-five
```

The collector saves the historical asset pack under `app/data/`. Normal startup reads that pack and does not make a new collection request. Practice selects from the saved pool; unavailable provider data is labelled synthetic rather than presented as live.

## Boundaries

- Provider requests are server-side and credit-bounded.
- Stablecoins, invalid rows, incomplete coverage, and future observations are rejected.
- Clues expose observed evidence before the player locks an allocation; later outcome fields remain private until reveal.
- The app is a research game with virtual balances, not a trading or execution product.
