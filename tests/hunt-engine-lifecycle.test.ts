import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase } from '../server/db/store.js';
import { readHuntRoom } from '../server/db/hunt.js';
import { HuntEngine } from '../server/domain/hunt/index.js';
import type { HuntCommand, HuntMatchView, HuntReveal } from '../shared/hunt.js';

const whaleId = 'player-whale';
const tracerId = 'player-tracer';
const primary = 'hunt-synthetic-asset-1';
const secondary = 'hunt-synthetic-asset-2';

function command(value: Record<string, unknown>, version: number, key: string): HuntCommand {
  return { ...value, expectedStateVersion: version, idempotencyKey: key } as HuntCommand;
}

function setupEngine(clock: () => Date = () => new Date('2026-09-17T12:00:00.000Z')) {
  const db = openDatabase(':memory:');
  const engine = new HuntEngine(db, { clock });
  const room = engine.createRoom(whaleId, { idempotencyKey: 'create', maxTracers: 1 });
  engine.joinRoom(tracerId, room.roomCode, { idempotencyKey: 'join' });
  const persisted = readHuntRoom(db, room.roomCode);
  assert.ok(persisted?.match_id);
  return { db, engine, matchId: persisted.match_id };
}

function view(engine: HuntEngine, matchId: string, actorId: string): HuntMatchView {
  return engine.getMatch(matchId, actorId);
}

test('lifecycle persists role-filtered state, idempotent commands, five rounds, and deterministic reconstruction', () => {
  const { db, engine, matchId } = setupEngine();
  try {
    const initial = view(engine, matchId, whaleId);
    assert.equal(initial.phase, 'setup');
    assert.equal(initial.stateVersion, 2);
    const selected = engine.command(
      matchId,
      whaleId,
      command(
        { kind: 'select-targets', primaryAssetId: primary, secondaryAssetId: secondary },
        initial.stateVersion,
        'targets',
      ),
    ) as HuntMatchView;
    assert.equal(selected.phase, 'whale-planning');
    const tracerSetup = view(engine, matchId, tracerId);
    assert.equal('ownTargets' in tracerSetup, false);
    assert.equal('plans' in tracerSetup, false);

    const firstPlan = command(
      { kind: 'submit-whale-plan', roundIndex: 1, action: 'burst', assetId: primary, units: 4 },
      selected.stateVersion,
      'plan-1',
    );
    const afterPlan = engine.command(matchId, whaleId, firstPlan) as HuntMatchView;
    assert.equal(afterPlan.phase, 'tracer-investigation');
    assert.deepEqual(engine.command(matchId, whaleId, firstPlan), afterPlan);
    assert.equal(view(engine, matchId, whaleId).stateVersion, afterPlan.stateVersion);
    assert.throws(
      () =>
        engine.command(
          matchId,
          whaleId,
          command(
            { kind: 'submit-whale-plan', roundIndex: 1, action: 'wait', units: 0 },
            selected.stateVersion,
            'stale',
          ),
        ),
      (error: unknown) => error instanceof Error && error.message.includes('state changed'),
    );

    for (let roundIndex = 1; roundIndex <= 5; roundIndex += 1) {
      let currentWhale = view(engine, matchId, whaleId);
      if (roundIndex > 1) {
        const action = roundIndex <= 2 ? 'burst' : roundIndex === 3 ? 'burst' : 'wait';
        const assetId = roundIndex <= 2 ? primary : roundIndex === 3 ? secondary : undefined;
        currentWhale = engine.command(
          matchId,
          whaleId,
          command(
            {
              kind: 'submit-whale-plan',
              roundIndex,
              action,
              units: action === 'wait' ? 0 : 4,
              ...(assetId ? { assetId } : {}),
            },
            currentWhale.stateVersion,
            `plan-${roundIndex}`,
          ),
        ) as HuntMatchView;
      }
      const tracer = view(engine, matchId, tracerId);
      const scan = engine.command(
        matchId,
        tracerId,
        command(
          { kind: 'purchase-scan', roundIndex, scanId: `${primary}:flow` },
          tracer.stateVersion,
          `scan-${roundIndex}`,
        ),
      ) as HuntMatchView;
      const suspicion = engine.command(
        matchId,
        tracerId,
        command(
          {
            kind: 'submit-suspicion',
            roundIndex,
            primaryAssetId: primary,
            secondaryAssetId: secondary,
          },
          scan.stateVersion,
          `suspicion-${roundIndex}`,
        ),
      ) as HuntMatchView;
      const finished = engine.command(
        matchId,
        tracerId,
        command(
          { kind: 'finish-investigation', roundIndex },
          suspicion.stateVersion,
          `finish-${roundIndex}`,
        ),
      ) as HuntMatchView;
      if (roundIndex < 5) assert.equal(finished.phase, 'whale-planning');
      else assert.equal(finished.phase, 'final-accusation');
    }

    const finalView = view(engine, matchId, tracerId);
    const reveal = engine.command(
      matchId,
      tracerId,
      command(
        {
          kind: 'final-accusation',
          primaryAssetId: 'hunt-synthetic-asset-3',
          secondaryAssetId: 'hunt-synthetic-asset-4',
        },
        finalView.stateVersion,
        'final',
      ),
    ) as HuntReveal;
    assert.equal(reveal.winner, 'whale');
    assert.equal(reveal.reason, 'objective-complete');
    const reconstruction = engine.reconstruction(matchId, tracerId);
    assert.equal(reconstruction.phase, 'finished');
    assert.deepEqual(reconstruction.targets, {
      primaryAssetId: primary,
      secondaryAssetId: secondary,
    });
    assert.equal(reconstruction.plans.length, 5);
    assert.ok(reconstruction.events.some((event) => event.kind === 'match-finished'));
    assert.deepEqual(engine.replay(matchId, tracerId), [reveal]);

    const restarted = new HuntEngine(db, { clock: () => new Date('2026-09-17T12:00:00.000Z') });
    assert.equal(view(restarted, matchId, tracerId).phase, 'finished');
    assert.deepEqual(restarted.reconstruction(matchId, tracerId), reconstruction);
  } finally {
    db.close();
  }
});

test('a missed phase deadline applies a declared default and keeps the match playable', () => {
  let now = Date.parse('2026-09-17T12:00:00.000Z');
  const clock = () => new Date(now);
  const { db, engine, matchId } = setupEngine(clock);
  try {
    const setup = view(engine, matchId, whaleId);
    const selected = engine.command(
      matchId,
      whaleId,
      command(
        { kind: 'select-targets', primaryAssetId: primary, secondaryAssetId: secondary },
        setup.stateVersion,
        'timeout-targets',
      ),
    ) as HuntMatchView;
    now += 16 * 60 * 1000;
    const expired = view(engine, matchId, tracerId);
    assert.equal(expired.phase, 'tracer-investigation');
    assert.equal(expired.deadline?.phase, 'tracer-investigation');
    assert.equal(selected.phase, 'whale-planning');
  } finally {
    db.close();
  }
});

test('crew mode shares five scans, keeps five private suspicions, and advances through the captain', () => {
  const db = openDatabase(':memory:');
  const engine = new HuntEngine(db, () => new Date('2026-09-17T12:00:00.000Z'));
  const tracerIds = [
    'crew-tracer-1',
    'crew-tracer-2',
    'crew-tracer-3',
    'crew-tracer-4',
    'crew-tracer-5',
  ];
  try {
    const room = engine.createRoom('crew-whale', { idempotencyKey: 'crew-create', maxTracers: 5 });
    tracerIds.forEach((actorId, index) =>
      engine.joinRoom(actorId, room.roomCode, { idempotencyKey: `crew-join-${index + 1}` }),
    );
    const matchId = readHuntRoom(db, room.roomCode)!.match_id!;
    const setup = engine.getMatch(matchId, 'crew-whale');
    const selected = engine.command(
      matchId,
      'crew-whale',
      command(
        { kind: 'select-targets', primaryAssetId: primary, secondaryAssetId: secondary },
        setup.stateVersion,
        'crew-targets',
      ),
    ) as HuntMatchView;
    const planned = engine.command(
      matchId,
      'crew-whale',
      command(
        { kind: 'submit-whale-plan', roundIndex: 1, action: 'burst', assetId: primary, units: 4 },
        selected.stateVersion,
        'crew-plan',
      ),
    ) as HuntMatchView;
    let version = planned.stateVersion;
    for (let index = 1; index <= 5; index += 1) {
      const actorId = tracerIds[index - 1]!;
      const scan = engine.command(
        matchId,
        actorId,
        command(
          { kind: 'purchase-scan', roundIndex: 1, scanId: `hunt-synthetic-asset-${index}:flow` },
          version,
          `crew-scan-${index}`,
        ),
      ) as HuntMatchView;
      version = scan.stateVersion;
    }
    const captainView = engine.getMatch(matchId, tracerIds[0]!);
    assert.equal(captainView.viewerRole, 'captain');
    assert.equal(captainView.scansRemaining, 0);
    for (let index = 0; index < tracerIds.length; index += 1) {
      const actorId = tracerIds[index]!;
      const suspicion = engine.command(
        matchId,
        actorId,
        command(
          {
            kind: 'submit-suspicion',
            roundIndex: 1,
            primaryAssetId: primary,
            secondaryAssetId: secondary,
          },
          version,
          `crew-suspicion-${index + 1}`,
        ),
      ) as HuntMatchView;
      version = suspicion.stateVersion;
    }
    const finished = engine.command(
      matchId,
      tracerIds[0]!,
      command({ kind: 'finish-investigation', roundIndex: 1 }, version, 'crew-finish'),
    ) as HuntMatchView;
    assert.equal(finished.phase, 'whale-planning');
    assert.equal(finished.roundIndex, 2);
  } finally {
    db.close();
  }
});
