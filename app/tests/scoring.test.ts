import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreAllocation, terminalMultiplier, validateWeights } from '../server/domain/scoring.js';

test('entry and exit costs reduce an unchanged asset while cash remains flat', () => {
  const prices = Array.from({ length: 3 }, () => ({ entry: 2, exit: 2 }));
  const invested = scoreAllocation([100, 0, 0, 0], prices);
  assert.ok(Math.abs(invested.endEquity - (10_000 * 0.997) / 1.003) < 1e-9);
  assert.ok(invested.returnPct < 0);
  assert.equal(scoreAllocation([0, 0, 0, 100], prices).endEquity, 10_000);
});

test('allocation requires four finite percentages in ten percent steps totaling exactly 100', () => {
  for (const weights of [
    [100, 0, 0],
    [100, 0, 0, 10],
    [30, 30, 30, 0],
    [33, 33, 34, 0],
    [NaN, 0, 0, 100],
    [-10, 110, 0, 0],
    ['100', 0, 0, 0],
  ])
    assert.throws(() => validateWeights(weights));
  assert.deepEqual(validateWeights([30, 20, 10, 40]), [30, 20, 10, 40]);
});

test('equal weight comparison uses exact thirds with the same costs', () => {
  const score = scoreAllocation(
    [0, 0, 0, 100],
    [
      { entry: 1, exit: 2 },
      { entry: 2, exit: 2 },
      { entry: 4, exit: 2 },
    ],
  );
  assert.ok(
    Math.abs(score.benchmarkPct - ((((2 + 1 + 0.5) / 3) * 0.997) / 1.003 - 1) * 100) < 1e-10,
  );
});

test('missing, invalid, and non-positive settlement prices never produce fabricated equity', () => {
  for (const price of [null, 0, -1, NaN, Infinity]) {
    assert.throws(() => terminalMultiplier(price, 1));
    assert.throws(() => terminalMultiplier(1, price));
  }
});
