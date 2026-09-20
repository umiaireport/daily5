import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  discoverLiveProviderAssets,
  LiveCollectionError,
  type LiveNansenClient,
} from '../server/domain/live.js';

function row(overrides: Record<string, unknown> = {}) {
  return {
    chain: 'ethereum',
    token_address: '0x0000000000000000000000000000000000000001',
    token_symbol: 'ALPHA',
    token_name: 'Alpha Signal',
    price_usd: 2,
    netflow: 150_000,
    volume: 330_000,
    liquidity: 2_000_000,
    ...overrides,
  };
}

test('Daily5 provider discovery returns 25 unique non-stable assets', async () => {
  const client = {
    async request() {
      return {
        cached: false,
        data: {
          data: [
            row({ token_symbol: 'USDC', token_address: '0xstable' }),
            ...Array.from({ length: 26 }, (_, index) =>
              row({
                token_symbol: `SIG${index}`,
                token_name: `Signal ${index}`,
                token_address: `0x${String(index + 1).padStart(40, '0')}`,
                netflow: 100_000 + index,
              }),
            ),
          ],
        },
      };
    },
  } as unknown as LiveNansenClient;
  const assets = await discoverLiveProviderAssets(client);
  assert.equal(assets.length, 25);
  assert.equal(
    assets.some((asset) => asset.symbol === 'USDC'),
    false,
  );
  assert.equal(new Set(assets.map((asset) => `${asset.chain}:${asset.address}`)).size, 25);
});

test('Daily5 provider discovery requires a complete 25-asset universe', async () => {
  const client = {
    async request() {
      return {
        cached: false,
        data: { data: [row(), row({ token_symbol: 'USDT', token_address: '0xstable' })] },
      };
    },
  } as unknown as LiveNansenClient;
  await assert.rejects(
    discoverLiveProviderAssets(client),
    (error: unknown) => error instanceof LiveCollectionError,
  );
});
