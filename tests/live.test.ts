import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  collectLiveScenario,
  LiveCollectionError,
  type LiveNansenClient,
} from '../server/domain/live.ts';
import { createLiveHuntBoardFactory } from '../server/domain/hunt/live-board.ts';

function row(overrides: Record<string, unknown> = {}) {
  return {
    chain: 'ethereum',
    token_address: '0x0000000000000000000000000000000000000001',
    token_symbol: 'ALPHA',
    token_name: 'Alpha Signal',
    price_usd: 2,
    price_change: 12,
    netflow: 150_000,
    buy_volume: 240_000,
    sell_volume: 90_000,
    volume: 330_000,
    liquidity: 2_000_000,
    ...overrides,
  } as unknown as LiveNansenClient;
}

test('live collection filters stablecoins, deduplicates addresses, and enriches three assets', async () => {
  const calls: string[] = [];
  const client = {
    async request(
      _operation: string,
      _body: unknown,
      _requestSchema: unknown,
      responseSchema: { parse: (value: unknown) => unknown },
    ) {
      calls.push(_operation);
      if (_operation === 'liveCandidates')
        return {
          cached: false,
          data: {
            data: [
              row({ token_symbol: 'USDC', token_address: '0xstable' }),
              row({ token_address: '0x1', token_symbol: 'ALPHA' }),
              row({
                token_address: '0x2',
                token_symbol: 'BETA',
                chain: 'solana',
                liquidity: 4_000_000,
              }),
              row({ token_address: '0x3', token_symbol: 'GAMMA', chain: 'base', price_change: -4 }),
              row({ token_address: '0x2', token_symbol: 'BETA', chain: 'solana' }),
            ],
          },
        };
      if (_operation === 'liveFlow')
        return {
          cached: false,
          data: {
            data: [
              {
                smart_trader_net_flow_usd: 275_000,
                smart_trader_wallet_count: 12,
              },
            ],
          },
        };
      if (_operation === 'liveSmartMoneyNetflow')
        return {
          cached: false,
          data: {
            data: [
              {
                token_address: '0x1',
                chain: 'ethereum',
                net_flow_24h_usd: 500_000,
                trader_count: 18,
              },
              {
                token_address: '0x2',
                chain: 'solana',
                net_flow_24h_usd: 500_000,
                trader_count: 18,
              },
              {
                token_address: '0x3',
                chain: 'base',
                net_flow_24h_usd: 500_000,
                trader_count: 18,
              },
            ],
          },
        };
      if (_operation === 'liveCandles')
        return {
          cached: false,
          data: {
            data: [
              { close: 1.8, volume: 12_000, interval_start: '2026-09-17T07:00:00Z' },
              { close: 2.2, volume: 21_000, interval_start: '2026-09-17T08:00:00Z' },
            ],
          },
        };
      return {
        cached: false,
        data: {
          data: {
            name: 'Enriched token',
            symbol: 'ENR',
            token_details: {},
            spot_metrics: { unique_buyers: 21, unique_sellers: 7 },
          },
        },
      };
    },
  } as unknown as LiveNansenClient;
  const scenario = await collectLiveScenario(client, () => new Date('2026-09-17T08:00:00Z'));
  assert.equal(scenario.mode, 'live');
  assert.equal(scenario.assets.length, 3);
  assert.deepEqual(
    scenario.assets.map((asset) => asset.id),
    ['a', 'b', 'c'],
  );
  assert.equal(scenario.assets[0]!.symbol, 'ENR');
  assert.equal(scenario.assets[0]!.entry, 1.8);
  assert.equal(scenario.assets[0]!.exit, 2.2);
  assert.equal(scenario.assets[0]!.smartMoney?.netFlowUsd, 500_000);
  assert.equal(scenario.assets[0]!.smartMoney?.walletCount, 18);
  assert.deepEqual(scenario.assets[0]!.volumeSeries, [12_000, 21_000]);
  assert.match(scenario.assets[0]!.clues.flow!.metrics[0]!.value, /500,000/);
  assert.equal(scenario.assets[0]!.clues.flow?.observedAt, scenario.cutoff);
  assert.equal(calls.filter((operation) => operation === 'liveTokenInfo').length, 3);
  assert.equal(calls.filter((operation) => operation === 'liveFlow').length, 3);
  assert.equal(calls.filter((operation) => operation === 'liveCandles').length, 3);
  assert.equal(calls.filter((operation) => operation === 'liveSmartMoneyNetflow').length, 1);
  assert.match(scenario.assets[0]!.clues.pulse!.warning, /Current Nansen/);
  const board = createLiveHuntBoardFactory({
    ...scenario,
    assets: scenario.assets.map((asset, index) => ({
      ...asset,
      symbol: `SIG${index}`,
      name: `Signal ${index}`,
    })),
  });
  const orders = ['alpha', 'beta', 'gamma', 'delta'].map((matchId) =>
    board(matchId, 1)
      .map((window) => window.market?.symbol)
      .join('|'),
  );
  assert.ok(new Set(orders).size > 1);
  assert.equal(board('alpha', 1)[0]?.market?.sourceKind, 'nansen');
});

test('live collection rejects a response with fewer than three usable assets', async () => {
  const client = {
    async request() {
      return {
        cached: false,
        data: { data: [row(), row({ token_symbol: 'USDT', token_address: '0xstable' })] },
      };
    },
  } as unknown as LiveNansenClient;
  await assert.rejects(
    collectLiveScenario(client, () => new Date('2026-09-17T08:00:00Z')),
    (error: unknown) => error instanceof LiveCollectionError,
  );
});
