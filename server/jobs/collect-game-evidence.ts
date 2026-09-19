import { randomUUID } from 'node:crypto';
import type { Schema } from '../nansen/client.js';
import {
  gameEvidenceRequestSchema,
  gameEvidenceResponseSchema,
  type GameEvidenceOperation,
  type HistoricalCandidateRow,
} from '../nansen/game-schemas.js';
import {
  EvidenceValidationError,
  normalizeCandles,
  normalizeSnapshots,
  normalizeTrades,
  validateCoverage,
} from '../evidence/normalize.js';
import type {
  CollectedGameEvidence,
  CoverageRecord,
  EvidenceRecordInput,
  NormalizedCandle,
} from '../evidence/types.js';
import type { SourceKind } from '../../shared/evidence.js';

export interface GameEvidenceProvider {
  request<T>(
    operation: GameEvidenceOperation,
    body: unknown,
    requestSchema: Schema<unknown>,
    responseSchema: Schema<T>,
  ): Promise<{ data: T; cached: boolean }>;
}

export interface CollectGameEvidenceOptions {
  readonly collectionId?: string;
  readonly collectedAt?: string;
  readonly sourceKind?: SourceKind;
  readonly chain?: string;
  readonly candidateCount?: number;
  readonly candidatePageSize?: number;
  readonly evidenceStartAt: string;
  readonly cutoffAt: string;
  readonly entryAt: string;
  readonly exitAt: string;
  readonly candleIntervalMinutes?: number;
  readonly includeIncomplete?: boolean;
}

export class GameEvidenceCollectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GameEvidenceCollectionError';
  }
}

function canonical(value: string, label: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new GameEvidenceCollectionError(`${label} is not a timestamp.`);
  return date.toISOString();
}

function rowsFrom(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value))
    return value.filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === 'object'),
    );
  if (!value || typeof value !== 'object') return [];
  const row = value as { data?: unknown };
  if (Array.isArray(row.data)) return rowsFrom(row.data);
  if (row.data && typeof row.data === 'object') return rowsFrom(row.data);
  return [];
}

function metadata(value: unknown): { warnings: string[]; truncated: boolean } {
  if (!value || typeof value !== 'object') return { warnings: [], truncated: false };
  const row = value as { warnings?: unknown; truncated?: unknown; data?: unknown };
  const nested =
    row.data && typeof row.data === 'object'
      ? metadata(row.data)
      : { warnings: [], truncated: false };
  return {
    warnings: [
      ...nested.warnings,
      ...(Array.isArray(row.warnings)
        ? row.warnings.filter((item): item is string => typeof item === 'string')
        : []),
    ],
    truncated: nested.truncated || row.truncated === true,
  };
}

function candidateRows(value: unknown): HistoricalCandidateRow[] {
  if (!value || typeof value !== 'object') return [];
  const row = value as { data?: unknown };
  return rowsFrom(row.data ?? value) as HistoricalCandidateRow[];
}

function splitCandles(
  candles: readonly NormalizedCandle[],
  cutoffAt: string,
  entryAt: string,
): {
  preDecisionCandles: readonly NormalizedCandle[];
  outcomeCandles: readonly NormalizedCandle[];
} {
  const cutoff = Date.parse(cutoffAt);
  const entry = Date.parse(entryAt);
  return {
    preDecisionCandles: candles.filter((candle) => Date.parse(candle.at) < cutoff),
    outcomeCandles: candles.filter((candle) => Date.parse(candle.at) >= entry),
  };
}

function coverage(
  input: CollectGameEvidenceOptions,
  collectedAt: string,
  warnings: readonly string[],
  truncated: boolean,
  preDecisionCandles: readonly NormalizedCandle[],
  outcomeCandles: readonly NormalizedCandle[],
  trades: readonly unknown[],
): CoverageRecord {
  const missingMeasurements: string[] = [];
  if (preDecisionCandles.length < 2) missingMeasurements.push('pre-decision-candles');
  if (outcomeCandles.length < 2) missingMeasurements.push('outcome-candles');
  if (!trades.length) missingMeasurements.push('timestamped-trades');
  const complete = !truncated && missingMeasurements.length === 0;
  return validateCoverage(
    {
      status: complete ? 'complete' : 'partial',
      description: complete
        ? 'Historical provider window passed coverage checks.'
        : 'Historical provider window is incomplete and cannot be published.',
      observedAt: collectedAt,
      startAt: input.evidenceStartAt,
      cutoffAt: input.cutoffAt,
      complete,
      truncated,
      warnings,
      missingMeasurements,
      expectedCandleIntervalMinutes: input.candleIntervalMinutes ?? 5,
    },
    { requireComplete: false },
  );
}

async function request<T>(
  provider: GameEvidenceProvider,
  operation: GameEvidenceOperation,
  body: unknown,
): Promise<T> {
  const requestSchema = gameEvidenceRequestSchema(operation);
  const responseSchema = gameEvidenceResponseSchema(operation) as Schema<T>;
  const response = await provider.request(operation, body, requestSchema, responseSchema);
  return responseSchema.parse(response.data) as T;
}

/** Collect historical provider inputs once; no player action can trigger these calls. */
export async function collectGameEvidence(
  provider: GameEvidenceProvider,
  options: CollectGameEvidenceOptions,
): Promise<CollectedGameEvidence> {
  const collectedAt = canonical(options.collectedAt ?? new Date().toISOString(), 'collectedAt');
  const evidenceStartAt = canonical(options.evidenceStartAt, 'evidenceStartAt');
  const cutoffAt = canonical(options.cutoffAt, 'cutoffAt');
  const entryAt = canonical(options.entryAt, 'entryAt');
  const exitAt = canonical(options.exitAt, 'exitAt');
  const sourceKind = options.sourceKind ?? 'historical-reconstructed';
  if (sourceKind === 'synthetic')
    throw new GameEvidenceCollectionError('Synthetic fixtures do not need provider collection.');
  const candidateCount = options.candidateCount ?? 5;
  const pageSize = options.candidatePageSize ?? Math.max(candidateCount, 20);
  if (!Number.isInteger(candidateCount) || candidateCount < 1)
    throw new GameEvidenceCollectionError('candidateCount must be positive.');
  if (!(
    Date.parse(evidenceStartAt) < Date.parse(cutoffAt) &&
    Date.parse(cutoffAt) <= Date.parse(entryAt) &&
    Date.parse(entryAt) < Date.parse(exitAt)
  ))
    throw new GameEvidenceCollectionError('Evidence times must be start < cutoff <= entry < exit.');
  const candidateResponse = await request(provider, 'historicalCandidates', {
    chains: [options.chain ?? 'base'],
    timeframe: '7d',
    filters: {},
    order_by: [{ field: 'netflow', direction: 'DESC' }],
    pagination: { page: 1, per_page: pageSize },
  });
  const candidates = candidateRows(candidateResponse);
  const seen = new Set<string>();
  const usable = candidates.filter((candidate) => {
    const chain = String(candidate.chain ?? '').trim();
    const address = String(candidate.token_address ?? '').trim();
    const key = `${chain.toLowerCase()}:${address.toLowerCase()}`;
    if (!chain || !address || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const assets: EvidenceRecordInput[] = [];
  for (const [index, candidate] of usable.entries()) {
    if (assets.length >= candidateCount) break;
    const chain = String(candidate.chain);
    const tokenAddress = String(candidate.token_address);
    const dateRange = { from: evidenceStartAt, to: cutoffAt };
    const [flowResponse, tradeResponse, candleResponse] = await Promise.all([
      request(provider, 'historicalFlow', {
        chain,
        token_address: tokenAddress,
        timeframe: '1d',
        filters: {},
      }),
      request(provider, 'historicalTrades', {
        chain,
        token_address: tokenAddress,
        date: dateRange,
        only_smart_money: false,
        pagination: { page: 1, per_page: 1000 },
        order_by: [{ field: 'block_timestamp', direction: 'ASC' }],
      }),
      request(provider, 'historicalCandles', {
        chain,
        token_address: tokenAddress,
        date: { from: evidenceStartAt, to: exitAt },
        timeframe: options.candleIntervalMinutes === 5 ? '5m' : '1h',
      }),
    ]);
    let candles: readonly NormalizedCandle[];
    let trades;
    try {
      candles = normalizeCandles(candleResponse, { tokenAddress });
      trades = normalizeTrades(tradeResponse);
    } catch (error) {
      if (error instanceof EvidenceValidationError && options.includeIncomplete !== true) continue;
      throw error;
    }
    const split = splitCandles(candles, cutoffAt, entryAt);
    const warnings = [
      ...metadata(flowResponse).warnings,
      ...metadata(tradeResponse).warnings,
      ...metadata(candleResponse).warnings,
    ];
    const truncated =
      metadata(flowResponse).truncated ||
      metadata(tradeResponse).truncated ||
      metadata(candleResponse).truncated;
    const snapshotRows = rowsFrom(flowResponse);
    let snapshots: Awaited<ReturnType<typeof normalizeSnapshots>> = [];
    try {
      snapshots = normalizeSnapshots(snapshotRows);
    } catch {
      snapshots = [];
    }
    const caseCoverage = coverage(
      { ...options, evidenceStartAt, cutoffAt },
      collectedAt,
      warnings,
      truncated,
      split.preDecisionCandles,
      split.outcomeCandles,
      trades,
    );
    if (!caseCoverage.complete && options.includeIncomplete !== true) continue;
    assets.push({
      caseId: `historical-${index + 1}-${tokenAddress.slice(-8)}`,
      roundIndex: assets.length + 1,
      sourceKind,
      chain,
      tokenAddress,
      symbol: typeof candidate.token_symbol === 'string' ? candidate.token_symbol : null,
      name: typeof candidate.token_name === 'string' ? candidate.token_name : null,
      evidenceStartAt,
      cutoffAt,
      entryAt,
      exitAt,
      collectionAt: collectedAt,
      preDecisionCandles: split.preDecisionCandles,
      outcomeCandles: split.outcomeCandles,
      trades,
      snapshots,
      coverage: caseCoverage,
      attribution: [{ label: 'Nansen historical API', sourceKind, url: 'https://nansen.ai' }],
    });
  }
  if (assets.length < candidateCount)
    throw new GameEvidenceCollectionError(
      `Only ${assets.length} complete historical assets were available; ${candidateCount} are required.`,
    );
  return Object.freeze({
    collectionId: options.collectionId ?? `historical-evidence-${randomUUID()}`,
    collectedAt,
    sourceKind,
    evidenceStartAt,
    cutoffAt,
    entryAt,
    exitAt,
    assets: Object.freeze(assets),
  });
}
