import type { DatabaseSync } from 'node:sqlite';
import type { CreateHuntV2Command, HuntV2Command, HuntV2MatchView } from '../../shared/hunt-v2.js';
import { readHuntV2Match } from '../db/hunt-v2.js';
import { HuntV2Engine, type HuntV2BoardFactory } from '../domain/hunt/v2.js';

/** Adds the computer seat and scheduler around the persisted Hunt v2 engine. */
export class HuntV2Service {
  readonly engine: HuntV2Engine;
  private readonly scheduler: ReturnType<typeof setInterval>;

  constructor(
    private readonly db: DatabaseSync,
    options: { readonly boardFactory?: HuntV2BoardFactory } = {},
  ) {
    this.engine = new HuntV2Engine(db, { boardFactory: options.boardFactory });
    this.scheduler = setInterval(() => this.tickBots(), 500);
    this.scheduler.unref?.();
  }

  dispose(): void {
    clearInterval(this.scheduler);
  }

  createMatch(playerId: string, command: CreateHuntV2Command): HuntV2MatchView {
    return this.engine.createMatch(playerId, command);
  }

  joinMatch(matchId: string, playerId: string): HuntV2MatchView {
    return this.engine.joinMatch(matchId, playerId);
  }

  getMatch(matchId: string, playerId: string): HuntV2MatchView {
    const view = this.engine.getMatch(matchId, playerId);
    this.runOneBotAction(matchId);
    return this.engine.getMatch(matchId, playerId);
  }

  command(matchId: string, playerId: string, command: HuntV2Command): HuntV2MatchView {
    const view = this.engine.command(matchId, playerId, command);
    this.runOneBotAction(matchId);
    return view;
  }

  rematch(matchId: string, playerId: string, idempotencyKey: string): HuntV2MatchView {
    return this.engine.rematch(matchId, playerId, idempotencyKey);
  }

  private tickBots(): void {
    this.engine.tick();
    const rows = this.db
      .prepare("SELECT match_id FROM hunt_v2_matches WHERE phase <> 'match_over'")
      .all() as unknown as readonly { match_id: string }[];
    rows.forEach((row) => this.runOneBotAction(row.match_id));
  }

  /** Makes one deterministic computer move from its public role view per tick. */
  private runOneBotAction(matchId: string): void {
    const row = readHuntV2Match(this.db, matchId);
    if (!row || !row.opponent_id.startsWith('computer:')) return;
    const botRole = row.player_role === 'whale' ? 'tracer' : 'whale';
    try {
      const view = this.engine.getMatch(matchId, row.opponent_id);
      if (view.role !== botRole) return;
      if (botRole === 'whale' && view.phase === 'whale_hide') {
        const zone = ['A', 'B', 'C'][matchId.charCodeAt(0) % 3] as 'A' | 'B' | 'C';
        const decoyZone = zone === 'A' ? 'B' : 'A';
        const selected = this.engine.command(matchId, row.opponent_id, {
          kind: 'select-whale-plan',
          zone,
          move: 'decoy',
          decoyZone,
          expectedStateVersion: view.stateVersion,
          idempotencyKey: `bot-plan-${view.stateVersion}`,
        });
        this.engine.command(matchId, row.opponent_id, {
          kind: 'hide-trade',
          expectedStateVersion: selected.stateVersion,
          idempotencyKey: `bot-hide-${selected.stateVersion}`,
        });
      } else if (botRole === 'tracer' && view.phase === 'tracer_hunt') {
        const zone = view.windows[view.roundIndex % 3]?.zone ?? 'A';
        if (view.scansRemaining > 0) {
          this.engine.command(matchId, row.opponent_id, {
            kind: 'scan',
            zone,
            scan: view.scans.length % 2 === 0 ? 'flow' : 'rhythm',
            expectedStateVersion: view.stateVersion,
            idempotencyKey: `bot-scan-${view.stateVersion}`,
          });
        } else {
          this.engine.command(matchId, row.opponent_id, {
            kind: 'lock-catch',
            zone,
            expectedStateVersion: view.stateVersion,
            idempotencyKey: `bot-catch-${view.stateVersion}`,
          });
        }
      }
    } catch {
      /* A player command or deadline transition can win the race. */
    }
  }
}
