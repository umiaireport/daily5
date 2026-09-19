import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type {
  CardKind,
  LeaderboardEntry,
  Round,
  RoundResult,
  SessionState,
  Weights,
} from '../../shared/types.js';
import { SCENARIOS, type SyntheticScenario } from '../../fixtures/synthetic/scenarios.js';
import { transaction } from '../db/store.js';
import { scoreAllocation, START_CASH, validateWeights } from './scoring.js';

export class GameError extends Error {
  constructor(
    message: string,
    public statusCode = 400,
  ) {
    super(message);
  }
}
interface SessionRow {
  id: string;
  name: string;
}
interface ChoiceRow {
  scenario_id: string;
  weights: string;
  result: string;
}
interface UnlockRow {
  asset_id: string;
  kind: CardKind;
}

export class Game {
  constructor(
    private db: DatabaseSync,
    private scenarios: SyntheticScenario[] = SCENARIOS,
  ) {}

  createSession(): SessionState {
    const id = randomUUID();
    const name = `Navigator ${id.slice(0, 6).toUpperCase()}`;
    this.db
      .prepare('INSERT INTO sessions(id,name,created_at) VALUES(?,?,?)')
      .run(id, name, new Date().toISOString());
    return this.session(id);
  }

  private choices(id: string): ChoiceRow[] {
    return this.db
      .prepare(
        'SELECT scenario_id,weights,result FROM choices WHERE session_id=? ORDER BY scenario_id',
      )
      .all(id) as unknown as ChoiceRow[];
  }

  session(id: string): SessionState {
    const row = this.db.prepare('SELECT id,name FROM sessions WHERE id=?').get(id) as unknown as
      SessionRow | undefined;
    if (!row) throw new GameError('Start a session to enter the arena.', 401);
    const choices = this.choices(id);
    const last = choices.at(-1);
    const equity = last ? (JSON.parse(last.result) as RoundResult).sessionEquity : START_CASH;
    return {
      id,
      name: row.name,
      completedRounds: choices.length,
      totalRounds: this.scenarios.length,
      equity,
      returnPct: (equity / START_CASH - 1) * 100,
    };
  }

  private scenario(scenarioId: string): SyntheticScenario {
    const scenario = this.scenarios.find((item) => item.id === scenarioId);
    if (!scenario) throw new GameError('Round not found.', 404);
    return scenario;
  }

  private assertCurrent(id: string, scenario: SyntheticScenario): SessionState {
    const session = this.session(id);
    if (scenario.index !== session.completedRounds + 1)
      throw new GameError('Complete the current round first.', 409);
    if (this.next(id).locked)
      throw new GameError('Continue from your saved result before starting the next round.', 409);
    return session;
  }

  private round(id: string, scenario: SyntheticScenario): Round {
    const unlocks = this.db
      .prepare('SELECT asset_id,kind FROM card_unlocks WHERE session_id=? AND scenario_id=?')
      .all(id, scenario.id) as unknown as UnlockRow[];
    const choice = this.choices(id).find((item) => item.scenario_id === scenario.id);
    return {
      id: scenario.id,
      index: scenario.index,
      total: this.scenarios.length,
      title: scenario.title,
      subtitle: scenario.subtitle,
      mode: scenario.mode ?? 'synthetic',
      sourceLabel: scenario.sourceLabel,
      sourceUrl: scenario.sourceUrl,
      cutoff: scenario.cutoff,
      assets: scenario.assets.map((asset) => ({
        id: asset.id,
        alias: asset.alias,
        category: asset.category,
        series: asset.series,
        clues: Object.fromEntries(
          unlocks
            .filter((item) => item.asset_id === asset.id)
            .map((item) => [item.kind, asset.clues[item.kind]]),
        ),
      })),
      unlocksRemaining: 2 - unlocks.length,
      locked: Boolean(choice),
      weights: choice ? (JSON.parse(choice.weights) as Weights) : null,
    };
  }

  next(id: string): Round {
    const session = this.session(id);
    const last = this.choices(id).at(-1);
    if (
      last &&
      !this.db
        .prepare('SELECT 1 FROM round_reviews WHERE session_id=? AND scenario_id=?')
        .get(id, last.scenario_id)
    ) {
      return this.round(id, this.scenario(last.scenario_id));
    }
    return this.round(
      id,
      this.scenarios[Math.min(session.completedRounds, this.scenarios.length - 1)]!,
    );
  }

  advance(id: string, scenarioId: string): Round {
    return transaction(this.db, () => {
      this.result(id, scenarioId);
      this.db
        .prepare(
          'INSERT OR IGNORE INTO round_reviews(session_id,scenario_id,reviewed_at) VALUES(?,?,?)',
        )
        .run(id, scenarioId, new Date().toISOString());
      return this.next(id);
    });
  }

  unlock(id: string, scenarioId: string, assetId: string, kind: CardKind): Round {
    return transaction(this.db, () => {
      const scenario = this.scenario(scenarioId);
      this.assertCurrent(id, scenario);
      if (
        !scenario.assets.some((asset) => asset.id === assetId) ||
        !['flow', 'buyers', 'pulse'].includes(kind)
      )
        throw new GameError('Choose a valid token and intelligence card.');
      const current = this.round(id, scenario);
      if (current.assets.find((asset) => asset.id === assetId)!.clues[kind]) return current;
      if (current.unlocksRemaining === 0)
        throw new GameError('Both intelligence credits are spent for this round.', 409);
      this.db
        .prepare('INSERT INTO card_unlocks(session_id,scenario_id,asset_id,kind) VALUES(?,?,?,?)')
        .run(id, scenarioId, assetId, kind);
      return this.round(id, scenario);
    });
  }

  choose(id: string, scenarioId: string, value: unknown): RoundResult {
    let weights: Weights;
    try {
      weights = validateWeights(value);
    } catch (error) {
      throw new GameError((error as Error).message);
    }
    return transaction(this.db, () => {
      const scenario = this.scenario(scenarioId);
      this.session(id);
      const existing = this.choices(id).find((item) => item.scenario_id === scenarioId);
      if (existing) {
        if (existing.weights !== JSON.stringify(weights))
          throw new GameError('This choice is already locked and cannot be changed.', 409);
        return JSON.parse(existing.result) as RoundResult;
      }
      const session = this.assertCurrent(id, scenario);
      const score = scoreAllocation(weights, scenario.assets);
      const sessionEquity = (session.equity * score.endEquity) / START_CASH;
      const result: RoundResult = {
        scenarioId,
        index: scenario.index,
        weights,
        startCash: START_CASH,
        ...score,
        cashPct: 0,
        sessionEquity,
        sessionReturnPct: (sessionEquity / START_CASH - 1) * 100,
        complete: scenario.index === this.scenarios.length,
        mode: scenario.mode ?? 'synthetic',
        totalRounds: this.scenarios.length,
        assets: scenario.assets.map((asset) => ({
          id: asset.id,
          alias: asset.alias,
          name: asset.name,
          symbol: asset.symbol,
          entryPrice: asset.entry,
          exitPrice: asset.exit,
          returnPct: (asset.exit / asset.entry - 1) * 100,
          explanation: asset.explanation,
          series: asset.outcomeSeries,
        })),
      };
      this.db
        .prepare(
          'INSERT INTO choices(session_id,scenario_id,weights,result,locked_at) VALUES(?,?,?,?,?)',
        )
        .run(
          id,
          scenarioId,
          JSON.stringify(weights),
          JSON.stringify(result),
          new Date().toISOString(),
        );
      return result;
    });
  }

  result(id: string, scenarioId: string): RoundResult {
    this.session(id);
    this.scenario(scenarioId);
    const choice = this.choices(id).find((item) => item.scenario_id === scenarioId);
    if (!choice) throw new GameError('Lock your allocation before revealing this outcome.', 403);
    return JSON.parse(choice.result) as RoundResult;
  }

  leaderboard(id: string): LeaderboardEntry[] {
    this.session(id);
    const sessions = this.db
      .prepare(
        'SELECT id,name FROM sessions WHERE (SELECT COUNT(*) FROM choices WHERE session_id=sessions.id)=? ORDER BY created_at,id',
      )
      .all(this.scenarios.length) as unknown as SessionRow[];
    return sessions
      .map((session) => this.session(session.id))
      .sort((a, b) => b.equity - a.equity || a.id.localeCompare(b.id))
      .slice(0, 25)
      .map((session, index) => ({
        rank: index + 1,
        name: session.name,
        equity: session.equity,
        returnPct: session.returnPct,
        isYou: session.id === id,
      }));
  }
}
