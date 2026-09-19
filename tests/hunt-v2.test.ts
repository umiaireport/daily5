import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db/store.js';
import { readHuntV2Match } from '../server/db/hunt-v2.js';
import { HuntV2Engine } from '../server/domain/hunt/v2.js';
import { HUNT_V2_MOVES, HUNT_V2_SCANS } from '../shared/hunt-v2.js';

test('Hunt v2 keeps the hidden zone private, returns repeat scans, and awards one catch point', () => {
  let now = Date.parse('2026-09-18T12:00:00.000Z');
  const db = openDatabase(':memory:');
  const engine = new HuntV2Engine(db, {
    clock: () => new Date(now),
    idFactory: () => 'v2-match-1',
  });
  try {
    const created = engine.createMatch('tracer-player', {
      role: 'tracer',
      idempotencyKey: 'create',
    });
    assert.equal(new Set(created.windows.map((window) => window.price.join(','))).size, 3);
    now += 2_100;
    const hide = engine.getMatch(created.matchId, 'tracer-player');
    assert.equal(hide.phase, 'whale_hide');
    assert.equal('hiddenZone' in hide, false);
    const opponent = readHuntV2Match(db, created.matchId)!.opponent_id;
    const selected = engine.command(created.matchId, opponent, {
      kind: 'select-whale-plan',
      zone: 'A',
      move: 'decoy',
      decoyZone: 'B',
      expectedStateVersion: hide.stateVersion,
      idempotencyKey: 'plan',
    });
    const hunting = engine.command(created.matchId, opponent, {
      kind: 'hide-trade',
      expectedStateVersion: selected.stateVersion,
      idempotencyKey: 'hide',
    });
    assert.equal(hunting.phase, 'tracer_hunt');
    assert.equal('hiddenZone' in hunting, false);
    const scanned = engine.command(created.matchId, 'tracer-player', {
      kind: 'scan',
      zone: 'B',
      scan: 'flow',
      expectedStateVersion: hunting.stateVersion,
      idempotencyKey: 'scan-b',
    });
    const repeated = engine.command(created.matchId, 'tracer-player', {
      kind: 'scan',
      zone: 'B',
      scan: 'flow',
      expectedStateVersion: scanned.stateVersion,
      idempotencyKey: 'scan-b-repeat',
    });
    assert.equal(repeated.scans.length, 1);
    assert.equal(repeated.stateVersion, scanned.stateVersion);
    const reveal = engine.command(created.matchId, 'tracer-player', {
      kind: 'lock-catch',
      zone: 'C',
      expectedStateVersion: repeated.stateVersion,
      idempotencyKey: 'catch',
    });
    assert.equal(reveal.phase, 'round_reveal');
    assert.equal(reveal.score.whale, 1);
    assert.equal(reveal.score.tracer, 0);
    assert.equal(reveal.roundResult?.reason, 'escaped');
    assert.equal(reveal.roundResult?.hiddenZone, 'A');
  } finally {
    db.close();
  }
});

test('Hunt v2 keeps the full whale move and evidence contracts active', () => {
  let now = Date.parse('2026-09-18T12:00:00.000Z');
  const db = openDatabase(':memory:');
  const engine = new HuntV2Engine(db, {
    clock: () => new Date(now),
    idFactory: () => 'v2-contracts',
    boardFactory: () =>
      (['A', 'B', 'C'] as const).map((zone, index) => ({
        zone,
        price: [100 + index, 101 + index, 102 + index],
        volume: [100, 110 + index, 120 + index],
        pulseIndices: [],
        market: {
          symbol: `SIG${index}`,
          name: `Signal ${index}`,
          chain: 'ethereum',
          sourceKind: 'nansen' as const,
          smartMoney: { direction: 'accumulating' as const, netFlowUsd: 1_000 },
        },
      })),
  });
  try {
    assert.deepEqual(HUNT_V2_MOVES, ['burst', 'drip', 'blend', 'decoy', 'wait']);
    assert.deepEqual(HUNT_V2_SCANS, [
      'flow',
      'concentration',
      'rhythm',
      'timing',
      'cross-asset',
      'position-growth',
    ]);
    const created = engine.createMatch('whale-player', {
      role: 'whale',
      idempotencyKey: 'create',
    });
    assert.equal(created.windows[0]?.market?.sourceKind, 'nansen');
    now += 2_100;
    let view = engine.getMatch(created.matchId, 'whale-player');
    for (const [index, move] of HUNT_V2_MOVES.entries()) {
      view = engine.command(created.matchId, 'whale-player', {
        kind: 'select-whale-plan',
        zone: 'A',
        move,
        ...(move === 'decoy' ? { decoyZone: 'B' as const } : {}),
        expectedStateVersion: view.stateVersion,
        idempotencyKey: `plan-${index}`,
      });
      assert.equal(view.whaleSelection?.move, move);
    }
    const hidden = engine.command(created.matchId, 'whale-player', {
      kind: 'hide-trade',
      expectedStateVersion: view.stateVersion,
      idempotencyKey: 'hide',
    });
    const tracer = readHuntV2Match(db, created.matchId)!.opponent_id;
    const scanned = engine.command(created.matchId, tracer, {
      kind: 'scan',
      zone: 'A',
      scan: 'position-growth',
      expectedStateVersion: hidden.stateVersion,
      idempotencyKey: 'scan',
    });
    assert.equal(scanned.scans[0]?.kind, 'position-growth');
  } finally {
    db.close();
  }
});

test('Hunt v2 timeouts score the acting opponent, stop at three, and rematch swaps roles', () => {
  let now = Date.parse('2026-09-18T12:00:00.000Z');
  const db = openDatabase(':memory:');
  const engine = new HuntV2Engine(db, {
    clock: () => new Date(now),
    idFactory: (() => {
      let index = 0;
      return () => `v2-match-${++index}`;
    })(),
  });
  try {
    const created = engine.createMatch('tracer-player', {
      role: 'tracer',
      idempotencyKey: 'create',
    });
    for (let round = 1; round <= 3; round += 1) {
      now += 2_100;
      let hide = engine.getMatch(created.matchId, 'tracer-player');
      if (hide.phase === 'round_intro') {
        now += 2_100;
        hide = engine.getMatch(created.matchId, 'tracer-player');
      }
      const opponent = readHuntV2Match(db, created.matchId)!.opponent_id;
      const selected = engine.command(created.matchId, opponent, {
        kind: 'select-whale-plan',
        zone: 'A',
        move: 'blend',
        expectedStateVersion: hide.stateVersion,
        idempotencyKey: `plan-${round}`,
      });
      engine.command(created.matchId, opponent, {
        kind: 'hide-trade',
        expectedStateVersion: selected.stateVersion,
        idempotencyKey: `hide-${round}`,
      });
      const hunting = engine.getMatch(created.matchId, 'tracer-player');
      const result = engine.command(created.matchId, 'tracer-player', {
        kind: 'lock-catch',
        zone: 'B',
        expectedStateVersion: hunting.stateVersion,
        idempotencyKey: `miss-${round}`,
      });
      if (round < 3) now += 3_100;
      else {
        assert.equal(result.phase, 'match_over');
        assert.equal(result.score.whale, 3);
        assert.equal(result.matchWinner, 'whale');
      }
    }
    const rematch = engine.rematch(created.matchId, 'tracer-player', 'rematch');
    assert.equal(rematch.role, 'whale');
    assert.equal(rematch.score.whale, 0);
    assert.equal(rematch.phase, 'round_intro');
  } finally {
    db.close();
  }
});

test('Hunt v2 whale timeout is explicit and awards exactly one tracer point', () => {
  let now = Date.parse('2026-09-18T12:00:00.000Z');
  const db = openDatabase(':memory:');
  const engine = new HuntV2Engine(db, {
    clock: () => new Date(now),
    idFactory: () => 'v2-timeout',
  });
  try {
    const created = engine.createMatch('tracer-player', {
      role: 'tracer',
      idempotencyKey: 'create',
    });
    now += 2_100;
    const hide = engine.getMatch(created.matchId, 'tracer-player');
    now += 12_100;
    const reveal = engine.getMatch(created.matchId, 'tracer-player');
    assert.equal(hide.phase, 'whale_hide');
    assert.equal(reveal.phase, 'round_reveal');
    assert.equal(reveal.score.tracer, 1);
    assert.equal(reveal.roundResult?.reason, 'whale-timeout');
  } finally {
    db.close();
  }
});

test('Hunt v2 lets a second human claim the open opponent seat before the round starts', () => {
  const db = openDatabase(':memory:');
  const engine = new HuntV2Engine(db, { idFactory: () => 'v2-human-duel' });
  try {
    const created = engine.createMatch('whale-player', {
      role: 'whale',
      idempotencyKey: 'create',
    });
    const joined = engine.joinMatch(created.matchId, 'tracer-player');
    assert.equal(joined.role, 'tracer');
    assert.deepEqual(
      joined.participants.map((participant) => [participant.displayName, participant.kind]),
      [
        ['You', 'human'],
        ['Opponent', 'human'],
      ],
    );
    const repeated = engine.joinMatch(created.matchId, 'tracer-player');
    assert.equal(repeated.stateVersion, joined.stateVersion);
  } finally {
    db.close();
  }
});
