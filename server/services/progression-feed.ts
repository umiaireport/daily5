import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { DailyFinalResult } from '../../shared/daily-five.js';
import type { HuntReveal } from '../../shared/hunt.js';
import type { DailyFiveAttemptRow } from '../db/daily-five.js';
import type { HuntMatchRow } from '../db/hunt.js';
import { readHuntParticipants } from '../db/hunt.js';
import type { HuntMatchScores, HuntSuspicionRecord } from '../domain/hunt/types.js';
import { ProgressionService } from '../domain/progression/index.js';

/** Recoverable, idempotent projection of persisted completions; no client-supplied scores. */
export function syncProgression(db: DatabaseSync, service: ProgressionService): void {
  const dailyRows = db
    .prepare(
      `SELECT a.* FROM daily_five_attempts a
    LEFT JOIN progression_daily_results p ON p.attempt_id=a.attempt_id
    WHERE a.phase='final-result' AND p.attempt_id IS NULL`,
    )
    .all() as unknown as DailyFiveAttemptRow[];
  for (const row of dailyRows) {
    const result = JSON.parse(row.final_result!) as DailyFinalResult;
    const pack = db
      .prepare('SELECT private_payload,public_payload FROM daily_five_days WHERE daily_id=?')
      .get(row.daily_id) as { private_payload: string; public_payload: string };
    // Every current day has one exact pack; shuffling presentation never creates a variant.
    const variantId = createHash('sha256').update(pack.private_payload).digest('hex');
    service.recordDailyResult({
      playerId: row.player_id,
      attemptId: row.attempt_id,
      dailyId: row.daily_id,
      mode: row.mode,
      completedAt: row.completed_at!,
      variantId,
      rulesVersion: (
        JSON.parse(pack.public_payload) as { rules: { version: 'daily-five-v1' | 'daily-five-v2' } }
      ).rules.version,
      finalResult: result,
    });
  }
  const matches = db
    .prepare(
      `SELECT m.* FROM hunt_matches m WHERE m.phase='finished'
    AND EXISTS (SELECT 1 FROM hunt_participants p WHERE p.match_id=m.match_id
      AND (p.kind='human' OR p.connection='substituted')
      AND NOT EXISTS (SELECT 1 FROM progression_hunt_results r WHERE r.match_id=m.match_id AND r.player_id=p.participant_id))`,
    )
    .all() as unknown as HuntMatchRow[];
  for (const match of matches) {
    const participants = readHuntParticipants(db, match.match_id);
    const reveal = JSON.parse(match.reveal_payload!) as HuntReveal;
    const scores = JSON.parse(match.scores_payload!) as HuntMatchScores;
    const suspicions = JSON.parse(match.suspicions_payload) as HuntSuspicionRecord[];
    const matchKind = db
      .prepare(
        "SELECT 1 FROM hunt_events WHERE match_id=? AND kind='participant-substituted' LIMIT 1",
      )
      .get(match.match_id)
      ? 'substituted'
      : participants.some((p) => p.kind === 'computer')
        ? 'computer'
        : 'human';
    const isPair = (pair: { primaryAssetId: string; secondaryAssetId: string }) =>
      new Set([pair.primaryAssetId, pair.secondaryAssetId]).has(reveal.primaryAssetId) &&
      new Set([pair.primaryAssetId, pair.secondaryAssetId]).has(reveal.secondaryAssetId);
    for (const participant of participants.filter(
      (p) => p.kind === 'human' || p.connection === 'substituted',
    )) {
      service.recordHuntResult({
        playerId: participant.participant_id,
        matchId: match.match_id,
        completedAt: match.completed_at!,
        role:
          participant.role === 'whale' ? 'whale' : participant.is_captain ? 'captain' : 'tracer',
        maxTracers: match.max_tracers,
        matchKind,
        reveal,
        scores,
        correctPairBeforeFinal: suspicions.some(
          (s) => s.actorId === participant.participant_id && isPair(s),
        ),
        finalIncludesDecoy: reveal.accusation !== null && !isPair(reveal.accusation),
      });
    }
  }
}
