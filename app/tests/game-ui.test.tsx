import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  AssetMiniCard,
  CapitalSummary,
  CluePanel,
  ClueTile,
  DirectionToggle,
  EvidencePin,
  LeverageControl,
  OutcomeStrip,
  PlayerSeat,
  PriceChart,
  RoundProgress,
  SourceLabel,
  getSharedChartScale,
  normalizeToStartingIndex,
} from '../web/game-ui/index.js';
import {
  SYNTHETIC_DAILY_FIVE,
  SYNTHETIC_DAILY_SAVED_RESULT,
  SYNTHETIC_HUNT_TRACER_VIEW,
  SYNTHETIC_REVEALED_CLUE,
} from '../fixtures/synthetic/contracts.js';

const asset = SYNTHETIC_DAILY_FIVE.rounds[0]!.candidates[0]!;
const descriptor = asset.clueDescriptors[0]!;

test('display chart helpers use a starting index of 100 and a shared scale', () => {
  assert.deepEqual(normalizeToStartingIndex(['2.00000000', '2.10000000']), [100, 105]);
  const scale = getSharedChartScale([
    ['1.00000000', '1.10000000'],
    ['1.00000000', '0.90000000'],
  ]);
  assert.equal(scale.min, 88);
  assert.ok(Math.abs(scale.max - 112) < 1e-9);
});

test('asset cards and charts only render public data and mark an evaluated liquidation candle', () => {
  const card = renderToStaticMarkup(
    <AssetMiniCard
      asset={asset}
      chartScale={getSharedChartScale(
        SYNTHETIC_DAILY_FIVE.rounds.map((round) =>
          round.candidates[0]!.chart.map((point) => point.value),
        ),
      )}
      selected
      namespace="daily-five"
    />,
  );
  assert.match(card, /Mystery A/);
  assert.match(card, /outcome independent/);
  assert.doesNotMatch(card, /factualHeadline|entryPrice|exitPrice/);

  const chart = renderToStaticMarkup(
    <PriceChart
      preDecision={[
        { at: '2026-09-17T10:00:00Z', value: '1.00000000' },
        { at: '2026-09-17T11:00:00Z', value: '1.02000000' },
      ]}
      revealed={[{ at: '2026-09-17T12:00:00Z', value: '0.90000000' }]}
      cutoffAt="2026-09-17T12:00:00Z"
      liquidationIndices={[2]}
      label="Mystery A price"
    />,
  );
  assert.match(chart, /Decision cutoff shown/);
  assert.match(chart, /CUTOFF/);
  assert.match(chart, /data-liquidation-candle="true"/);
  assert.match(chart, /Liquidation candle evaluated/);
});

test('locked clues stay generic while revealed clues expose factual evidence', () => {
  const locked = renderToStaticMarkup(<ClueTile clue={descriptor} state="locked" />);
  assert.match(locked, /What did the completed evidence window show/);
  assert.match(locked, /Locked/);
  assert.doesNotMatch(locked, /transfers were mixed/);

  const revealed = renderToStaticMarkup(
    <CluePanel
      clues={[descriptor]}
      unlockedClues={[{ ...SYNTHETIC_REVEALED_CLUE, clueId: descriptor.clueId }]}
      unlocksRemaining={2}
      namespace="daily-five"
    />,
  );
  assert.match(revealed, /Observed transfers were mixed/);
  assert.match(revealed, /Revealed/);
});

test('controls expose text, keyboard semantics, and locked states', () => {
  const controls = renderToStaticMarkup(
    <>
      <DirectionToggle value="short" namespace="daily-five" />
      <LeverageControl value={25} namespace="daily-five" />
      <RoundProgress currentRound={3} totalRounds={5} completedRounds={2} namespace="daily-five" />
      <CluePanel clues={[descriptor]} unlocksRemaining={0} namespace="daily-five" />
    </>,
  );
  assert.match(controls, /role="radio"/);
  assert.match(controls, /aria-checked="true"/);
  assert.match(controls, /aria-valuetext="25 times leverage"/);
  assert.match(controls, /Round 3 of 5/);
  assert.match(controls, /0 of 3 clue unlocks remaining/);
  assert.match(controls, /disabled/);
});

test('hunt and result primitives carry role, source, pin, and liquidation text', () => {
  const markup = renderToStaticMarkup(
    <>
      <PlayerSeat
        participant={SYNTHETIC_HUNT_TRACER_VIEW.participants[1]!}
        namespace="whale-hunt"
      />
      <EvidencePin evidence={SYNTHETIC_REVEALED_CLUE} pinned namespace="whale-hunt" />
      <SourceLabel sourceKind="synthetic" coverage={asset.coverage} namespace="daily-five" />
      <CapitalSummary
        startingCapital="50000.00"
        roundStake="10000.00"
        remainingCapital="40000.00"
        namespace="daily-five"
      />
      <OutcomeStrip result={SYNTHETIC_DAILY_SAVED_RESULT.result} namespace="daily-five" />
    </>,
  );
  assert.match(markup, /Computer/);
  assert.match(markup, /Pinned for the team/);
  assert.match(markup, /Synthetic fixture/);
  assert.match(markup, /\$50,?000\.00/);
  assert.match(markup, /Ticket equity/);
});

test('visual system CSS keeps interaction targets, focus, responsive, and reduced-motion rules local', () => {
  const css = readFileSync(new URL('../web/game-ui.css', import.meta.url), 'utf8');
  assert.match(css, /min-height:\s*2\.75rem/);
  assert.match(css, /focus-visible/);
  assert.match(css, /max-width:\s*360px/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.daily-five/);
  assert.match(css, /\.whale-hunt/);
});
