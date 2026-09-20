import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DailyFiveCasePack } from './types.js';

export interface DailyFiveSnapshotIdentity {
  readonly chain: string;
  readonly address: string;
  readonly name: string;
  readonly symbol: string;
}

/**
 * The saved pack is a derived, attribution-bearing snapshot rather than a raw
 * provider response. Keeping the current UTC publication on disk makes
 * same-day restarts consistent without another provider collection.
 */
export function readDailyFiveSnapshot(
  filePath: string,
  dailyId: string | undefined,
  identities: readonly DailyFiveSnapshotIdentity[] = [],
): DailyFiveCasePack | null {
  if (!existsSync(filePath)) return null;
  try {
    const value = JSON.parse(readFileSync(filePath, 'utf8')) as DailyFiveCasePack;
    if (
      !value ||
      value.cohort !== 'nansen-historical-daily-v3-whale-pools' ||
      (dailyId !== undefined && value.publicChallenge?.dailyId !== dailyId)
    )
      return null;
    if (!identities.length) return value;
    const byKey = new Map(
      identities.map((identity) => [
        `${identity.chain}:${identity.address}`.toLowerCase(),
        identity,
      ]),
    );
    return {
      ...value,
      privateRounds: value.privateRounds.map((round) => ({
        ...round,
        candidates: round.candidates.map((candidate) => {
          if (candidate.realAssetName || !candidate.realAssetKey) return candidate;
          const identity = byKey.get(candidate.realAssetKey.toLowerCase());
          return identity
            ? {
                ...candidate,
                realAssetName: identity.name,
                realAssetSymbol: identity.symbol,
              }
            : candidate;
        }),
      })),
    };
  } catch {
    return null;
  }
}

export function writeDailyFiveSnapshot(filePath: string, pack: DailyFiveCasePack): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(pack, null, 2)}\n`, 'utf8');
  renameSync(temporaryPath, filePath);
}
