import { randomInt } from 'node:crypto';
import type { DailyFivePublic, DailyRoundPublic } from '../../../shared/daily-five.js';
import type { DailyFiveV2Rules } from '../../../shared/game-rules.js';
import type { DailyFiveCasePack, DailyFivePrivateCandidate } from './types.js';

/**
 * Rebuilds one fresh five-asset practice board from an immutable provider pool.
 * The selected identities remain reveal-only because the engine still projects
 * the public candidate aliases before a ticket is locked.
 */
export function createRandomPracticeCasePack(
  dailyId: string,
  dayStart: number,
  rules: DailyFiveV2Rules,
  source: DailyFiveCasePack,
): DailyFiveCasePack {
  const publicCandidates = source.publicChallenge.rounds.flatMap((round) => round.candidates);
  const sourceRoundByAsset = new Map(
    source.publicChallenge.rounds.flatMap((round) =>
      round.candidates.map((candidate) => [candidate.assetId, round] as const),
    ),
  );
  const privateCandidates = source.privateRounds.flatMap((round) => round.candidates);
  const privateById = new Map(privateCandidates.map((candidate) => [candidate.assetId, candidate]));
  const available = publicCandidates.filter((candidate) => privateById.has(candidate.assetId));
  if (available.length < rules.candidatesPerRound)
    throw new Error('Practice needs at least five provider or fallback assets.');

  const shuffled = [...available];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [shuffled[index], shuffled[swap]] = [shuffled[swap]!, shuffled[index]!];
  }
  const selected = shuffled.slice(0, rules.candidatesPerRound);
  const cutoffAt = new Date(dayStart + 60 * 60 * 1_000).toISOString();
  const candidates = selected.map((candidate, index) => ({
    ...shiftPublicCandidate(
      candidate,
      sourceRoundByAsset.get(candidate.assetId)!.cutoffAt,
      cutoffAt,
    ),
    assetId: `${dailyId}-asset-${index + 1}`,
    attemptAlias: `Mystery ${String.fromCharCode(65 + index)}`,
    colorIndex: index,
    unlockedClues: [],
  }));
  const privateRoundCandidates: DailyFivePrivateCandidate[] = selected.map((candidate, index) => {
    const original = privateById.get(candidate.assetId)!;
    return {
      ...shiftPrivateCandidate(
        original,
        sourceRoundByAsset.get(candidate.assetId)!.cutoffAt,
        cutoffAt,
        `${dailyId}-asset-${index + 1}`,
      ),
      assetId: `${dailyId}-asset-${index + 1}`,
      variantId: `${original.variantId}-practice-${index + 1}`,
    };
  });
  const publicRound: DailyRoundPublic = {
    roundIndex: 1,
    cutoffAt,
    candidates,
    evidence: {
      status: 'available',
      sourceKind: candidates[0]?.attribution[0]?.sourceKind ?? 'synthetic',
    },
    unlocksRemaining: rules.clueUnlocksPerRound,
  };
  const publicChallenge: DailyFivePublic = {
    dailyId,
    rules,
    rounds: [publicRound],
    publishedAt: new Date(dayStart).toISOString(),
  };
  return {
    publicChallenge,
    privateRounds: [{ roundIndex: 1, candidates: privateRoundCandidates }],
    cohort: source.cohort.includes('nansen')
      ? 'nansen-practice-random-v1'
      : 'synthetic-practice-v1',
  };
}

function shiftIso(value: string, deltaMs: number): string {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed + deltaMs).toISOString() : value;
}

function shiftPublicCandidate(
  candidate: DailyFiveCasePack['publicChallenge']['rounds'][number]['candidates'][number],
  sourceCutoff: string,
  cutoff: string,
) {
  const deltaMs = Date.parse(cutoff) - Date.parse(sourceCutoff);
  return {
    ...candidate,
    chart: candidate.chart.map((point) => ({ ...point, at: shiftIso(point.at, deltaMs) })),
    coverage: {
      ...candidate.coverage,
      observedAt: shiftIso(candidate.coverage.observedAt, deltaMs),
    },
  };
}

function shiftPrivateCandidate(
  candidate: DailyFivePrivateCandidate,
  sourceCutoff: string,
  cutoff: string,
  assetId: string,
): DailyFivePrivateCandidate {
  const deltaMs = Date.parse(cutoff) - Date.parse(sourceCutoff);
  const clues = candidate.clues?.map((clue) => {
    const next = {
      ...clue,
      evidenceCutoff: shiftIso(clue.evidenceCutoff, deltaMs),
      coverage: { ...clue.coverage, observedAt: shiftIso(clue.coverage.observedAt, deltaMs) },
    };
    if (clue.scope?.kind === 'asset') next.scope = { ...clue.scope, assetId };
    if (clue.window)
      next.window = {
        ...clue.window,
        startAt: shiftIso(clue.window.startAt, deltaMs),
        endAt: shiftIso(clue.window.endAt, deltaMs),
      };
    return next;
  });
  return {
    ...candidate,
    candles: candidate.candles.map((candle) => ({ ...candle, at: shiftIso(candle.at, deltaMs) })),
    ...(clues ? { clues } : {}),
    ...(candidate.windowStart ? { windowStart: shiftIso(candidate.windowStart, deltaMs) } : {}),
    ...(candidate.windowEnd ? { windowEnd: shiftIso(candidate.windowEnd, deltaMs) } : {}),
  };
}
