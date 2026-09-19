import type { DailyFivePublic, DailyRoundPublic } from '../../../shared/daily-five.js';
import type {
  EvidenceCategory,
  PublicAssetEvidence,
  RevealedClue,
} from '../../../shared/evidence.js';
import {
  DAILY_FIVE_RULES,
  priceFromUnits,
  type DailyFiveRules,
  type DailyFiveV2Rules,
  type Price,
} from '../../../shared/game-rules.js';
import { observationClue, syntheticObservations, syntheticPriceBaseUnits } from './observations.js';
import type { DailyFiveCasePack, DailyFivePrivateRound } from './types.js';

const CATEGORIES: readonly EvidenceCategory[] = [
  'flow',
  'crowd',
  'whale-footprint',
  'volume',
  'volatility',
  'absorption',
];

function at(base: number, minutes: number): string {
  return new Date(base + minutes * 60_000).toISOString();
}

function scaledPrice(units: bigint): Price {
  return priceFromUnits(units < 1n ? 1n : units);
}

function clue(
  roundIndex: number,
  assetIndex: number,
  category: EvidenceCategory,
  observations: ReturnType<typeof syntheticObservations>,
): RevealedClue {
  return {
    clueId: `daily-clue-${roundIndex}-${assetIndex}-${category}`,
    category,
    title: category.replace('-', ' '),
    ...observationClue(category, observations),
    limitation:
      'Fictional trades and wallets for this puzzle only; no live market or complete ownership data.',
    evidenceCutoff: '',
    scope: { kind: 'asset', assetId: `daily-${roundIndex}-${assetIndex}` },
    roundIndex,
    sourceKind: 'synthetic',
    coverage: {
      status: 'partial',
      description: 'Synthetic fixture coverage is intentionally labeled and bounded.',
      observedAt: '',
    },
    attribution: [{ label: 'Synthetic fixture', sourceKind: 'synthetic' }],
  };
}

function asset(
  roundIndex: number,
  assetIndex: number,
  cutoffMs: number,
): { publicAsset: PublicAssetEvidence; privateAsset: DailyFivePrivateRound['candidates'][number] } {
  const assetId = `daily-${roundIndex}-${assetIndex}`;
  const cutoffAt = new Date(cutoffMs).toISOString();
  const observations = syntheticObservations(roundIndex, assetIndex, cutoffMs);
  const { chart } = observations;
  const descriptors = CATEGORIES.map((category) => ({
    clueId: `daily-clue-${roundIndex}-${assetIndex}-${category}`,
    category,
    title: category.replace('-', ' '),
    question: 'What did the completed evidence window show before the decision cutoff?',
  }));
  const publicAsset: PublicAssetEvidence = {
    assetId,
    attemptAlias: `Mystery ${String.fromCharCode(65 + assetIndex)}`,
    colorIndex: assetIndex,
    chart,
    currentPrice: chart.at(-1)?.value,
    changePct: `${((Number(chart.at(-1)?.value ?? 0) / Number(chart[0]?.value ?? 1) - 1) * 100).toFixed(2)}%`,
    volumeUsd: `$${(120_000 + assetIndex * 41_000 + roundIndex * 8_000).toLocaleString('en-US')}`,
    liquidityUsd: `$${(480_000 + assetIndex * 67_000).toLocaleString('en-US')}`,
    clueDescriptors: descriptors,
    unlockedClues: [],
    coverage: {
      status: 'partial',
      description: 'Synthetic fixture coverage is intentionally labeled and bounded.',
      observedAt: cutoffAt,
    },
    attribution: [{ label: 'Synthetic fixture', sourceKind: 'synthetic' }],
  };
  const entryUnits = syntheticPriceBaseUnits(assetIndex, roundIndex);
  const returnBps = BigInt(-180 + ((roundIndex * 97 + assetIndex * 131) % 650));
  const exitUnits = entryUnits + (entryUnits * returnBps) / 10_000n;
  const candles = Array.from({ length: 12 }, (_, index) => {
    const open = entryUnits + ((exitUnits - entryUnits) * BigInt(index)) / 11n;
    const close = entryUnits + ((exitUnits - entryUnits) * BigInt(index + 1)) / 11n;
    const high = (open > close ? open : close) + entryUnits / 1_000n;
    const low = (open < close ? open : close) - entryUnits / 1_000n;
    return {
      at: at(cutoffMs, (index + 1) * 5),
      open: scaledPrice(open),
      high: scaledPrice(high),
      low: scaledPrice(low),
      close: scaledPrice(close),
      closed: true,
    };
  });
  const privateClues = CATEGORIES.map((category) => ({
    ...clue(roundIndex, assetIndex, category, observations),
    evidenceCutoff: cutoffAt,
    coverage: { ...publicAsset.coverage },
    scope: { kind: 'asset' as const, assetId },
    roundIndex,
  }));
  return {
    publicAsset,
    privateAsset: {
      assetId,
      variantId: `synthetic-variant-${roundIndex}-${assetIndex}`,
      candles,
      clues: privateClues,
      realAssetKey: `synthetic-asset-${roundIndex}-${assetIndex}`,
      realAssetName: `Synthetic Asset ${roundIndex}-${assetIndex + 1}`,
      realAssetSymbol: `SYN${roundIndex}${assetIndex + 1}`,
      windowStart: candles[0]!.at,
      windowEnd: candles.at(-1)!.at,
    },
  };
}

/** Builds a credential-free deterministic case pack for local development and tests. */
export function createSyntheticDailyFiveCasePack(
  dailyId: string,
  dayStart = Date.parse(`${dailyId.replace(/^daily-/, '')}T00:00:00.000Z`),
  rules: DailyFiveRules | DailyFiveV2Rules = DAILY_FIVE_RULES,
): DailyFiveCasePack {
  const parsedDay = Number.isFinite(dayStart)
    ? dayStart
    : Date.parse(
        `${dailyId
          .replace(/^daily-v2-wallet-/, '')
          .replace(/^daily-v2-/, '')
          .replace(/^daily-/, '')}T00:00:00.000Z`,
      );
  if (!dailyId.trim() || !Number.isFinite(parsedDay))
    throw new Error('A valid daily id is required.');
  const rounds: DailyRoundPublic[] = [];
  const privateRounds: DailyFivePrivateRound[] = [];
  for (let roundIndex = 1; roundIndex <= rules.totalRounds; roundIndex += 1) {
    const cutoffMs = parsedDay + (roundIndex - 1) * 2 * 60 * 60_000 + 60 * 60_000;
    const assets = Array.from({ length: rules.candidatesPerRound }, (_, assetIndex) =>
      asset(roundIndex, assetIndex, cutoffMs),
    );
    rounds.push({
      roundIndex,
      cutoffAt: new Date(cutoffMs).toISOString(),
      candidates: assets.map(({ publicAsset }) => publicAsset),
      evidence: { status: 'available', sourceKind: 'synthetic' },
      unlocksRemaining: rules.clueUnlocksPerRound,
    });
    privateRounds.push({
      roundIndex,
      candidates: assets.map(({ privateAsset }) => privateAsset),
    });
  }
  const publicChallenge: DailyFivePublic = {
    dailyId,
    rules,
    rounds,
    publishedAt: new Date(parsedDay).toISOString(),
  };
  return {
    publicChallenge,
    privateRounds,
    cohort: rules.version === 'daily-five-v2' ? 'synthetic-case-pack-v2' : 'synthetic-case-pack-v1',
  };
}
