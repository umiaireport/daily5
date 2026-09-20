import { useEffect, useMemo, useState } from 'react';
import type {
  HuntV2Command,
  HuntV2MatchView,
  HuntV2Move,
  HuntV2Role,
  HuntV2ScanKind,
  HuntV2Transport,
  HuntV2Window,
  HuntV2Zone,
} from '../../shared/hunt-v2.js';
import { HUNT_V2_ZONES } from '../../shared/hunt-v2.js';
import { createHuntV2ApiTransport, HuntV2ApiError } from '../api/hunt-v2.js';
import { GameIcon, WhaleSilhouette } from '../game-ui/primitives.js';
import '../game-ui.css';
import '../hunt.css';

export type HuntEntryRole = HuntV2Role;
export type HuntMode = 'duel';
export interface HuntRoundReconstruction {
  readonly roundIndex: number;
  readonly whaleAction: string;
}
export interface HuntReconstruction {
  readonly rounds: readonly HuntRoundReconstruction[];
  readonly decisiveExplanation: string;
}
export interface HuntScreenProps {
  readonly initialRole?: HuntEntryRole;
  readonly initialMatch?: HuntV2MatchView;
  readonly matchId?: string;
  readonly transport?: HuntV2Transport;
}

const ZONE_LABELS: Record<HuntV2Zone, string> = { A: 'Window A', B: 'Window B', C: 'Window C' };
const ROLE_COPY = {
  whale: { title: 'Hide your trade.', detail: 'Make the tracer choose the wrong zone.' },
  tracer: { title: 'Read the activity.', detail: 'Find the whale. Lock your catch.' },
} as const;
const MOVE_COPY: Record<HuntV2Move, { title: string; detail: string }> = {
  burst: { title: 'Burst', detail: 'One forceful pulse, then a fast fade.' },
  drip: { title: 'Drip', detail: 'Small repeated buys that build slowly.' },
  blend: { title: 'Blend', detail: 'Several steady prints across the window.' },
  decoy: { title: 'Decoy', detail: 'A real trade plus a larger false pulse elsewhere.' },
  wait: { title: 'Late push', detail: 'Keep the footprint quiet until the close.' },
};
const SCAN_COPY: Record<HuntV2ScanKind, { title: string; detail: string }> = {
  flow: { title: 'Flow', detail: 'Did capital keep moving in?' },
  concentration: { title: 'Concentration', detail: 'Was one print doing all the work?' },
  rhythm: { title: 'Rhythm', detail: 'Did activity repeat or fade?' },
  timing: { title: 'Timing', detail: 'Did the move build early or late?' },
  'cross-asset': { title: 'Cross-asset', detail: 'Does this window lead the board?' },
  'position-growth': { title: 'Position growth', detail: 'Did the footprint keep expanding?' },
};

function commandMeta(match: HuntV2MatchView, label: string) {
  return {
    expectedStateVersion: match.stateVersion,
    idempotencyKey: `hunt-v2-${label}-${match.stateVersion}-${Date.now()}`,
  } as const;
}
function roleLabel(role: HuntV2Role): string {
  return role === 'whale' ? 'Whale' : 'Tracer';
}
function phaseLabel(phase: HuntV2MatchView['phase']): string {
  if (phase === 'round_intro') return 'Round briefing';
  if (phase === 'whale_hide') return 'Whale is hiding';
  if (phase === 'tracer_hunt') return 'Tracer is investigating';
  if (phase === 'round_reveal') return 'Round result';
  return 'Match complete';
}
function phaseMessage(view: HuntV2MatchView): string {
  if (view.phase === 'round_intro') return 'Get ready. The next chart is loading.';
  if (view.phase === 'whale_hide')
    return view.role === 'whale'
      ? 'Choose a zone and a move, preview the footprint, then hide it.'
      : 'The whale is hiding. Hunt starts when the trade is locked.';
  if (view.phase === 'tracer_hunt')
    return view.role === 'tracer'
      ? 'Scan the activity, choose a target, and lock your catch.'
      : 'The tracer is investigating. Watch the scans and protect your secret.';
  if (view.phase === 'round_reveal')
    return view.roundResult?.explanation ?? 'The round is resolved.';
  return view.matchWinner
    ? `${roleLabel(view.matchWinner)} wins the match.`
    : 'The match is complete.';
}
function formatRemaining(view: HuntV2MatchView, now: number): string {
  if (!view.deadline) return '—';
  const serverOffset = Date.parse(view.serverNow) - Date.now();
  const remaining = Math.max(0, Date.parse(view.deadline.at) - (now + serverOffset));
  return `${Math.ceil(remaining / 1000)}s`;
}
function linePoints(values: readonly number[], min: number, max: number): string {
  return values
    .map((value, index) => {
      const x = 8 + (index / Math.max(1, values.length - 1)) * 284;
      const y = 76 - ((value - min) / Math.max(0.01, max - min)) * 58;
      return `${x.toFixed(1)},${Math.max(8, Math.min(76, y)).toFixed(1)}`;
    })
    .join(' ');
}

function MarketChart({
  window,
  selected,
  revealed,
}: {
  window: HuntV2Window;
  selected: boolean;
  revealed: boolean;
}) {
  const min = Math.min(...window.price) - 1;
  const max = Math.max(...window.price) + 1;
  const maxVolume = Math.max(...window.volume, 1);
  return (
    <div
      className="hunt-v2-chart"
      role="img"
      aria-label={`${ZONE_LABELS[window.zone]} price trace and volume bars`}
    >
      <svg viewBox="0 0 300 108" preserveAspectRatio="none" aria-hidden="true">
        {[22, 48, 74].map((y) => (
          <line key={y} className="hunt-v2-chart__grid" x1="8" x2="292" y1={y} y2={y} />
        ))}
        {window.volume.map((value, index) => {
          const width = 13;
          const x = 8 + (index / Math.max(1, window.volume.length - 1)) * 284 - width / 2;
          const height = (value / maxVolume) * 25;
          return (
            <rect
              key={index}
              className={`hunt-v2-chart__volume ${window.pulseIndices.includes(index) ? 'is-pulse' : ''}`}
              x={x}
              y={98 - height}
              width={width}
              height={height}
              rx="1"
            />
          );
        })}
        <polyline
          className={`hunt-v2-chart__line ${selected ? 'is-selected' : ''} ${revealed ? 'is-revealed' : ''}`}
          points={linePoints(window.price, min, max)}
        />
        {window.pulseIndices.map((index) => {
          const value = window.price[index];
          if (value === undefined) return null;
          const x = 8 + (index / Math.max(1, window.price.length - 1)) * 284;
          const y = 76 - ((value - min) / Math.max(0.01, max - min)) * 58;
          return (
            <circle
              key={index}
              className="hunt-v2-chart__pulse"
              cx={x}
              cy={Math.max(8, Math.min(76, y))}
              r="3"
            />
          );
        })}
      </svg>
      <div className="hunt-v2-chart__legend">
        <span>PRICE TRACE</span>
        <span>VOLUME</span>
      </div>
    </div>
  );
}

function ScoreHeader({ view, now }: { view: HuntV2MatchView; now: number }) {
  return (
    <header className="hunt-v2-score-header">
      <div className="hunt-v2-score-side hunt-v2-score-side--whale">
        <span className="hunt-v2-score-role">
          <WhaleSilhouette /> Whale
        </span>
        <strong>{view.score.whale}</strong>
        <div
          className="hunt-v2-round-marks"
          aria-label={`Whale has won ${view.score.whale} rounds`}
        >
          {view.roundResults.map((result) => (
            <span
              key={`whale-${result.roundIndex}`}
              className={result.winner === 'whale' ? 'is-won' : 'is-lost'}
            >
              {result.winner === 'whale' ? 'W' : '·'}
            </span>
          ))}
        </div>
      </div>
      <div className="hunt-v2-round-status">
        <span className="hunt-ui__eyebrow">
          ROUND {view.roundIndex} / {view.totalRounds}
        </span>
        <strong>
          {view.score.whale >= 2 && view.score.tracer >= 2 ? 'FINAL ROUND' : 'FIRST TO 3'}
        </strong>
        <span>
          {phaseLabel(view.phase)} · {formatRemaining(view, now)}
        </span>
      </div>
      <div className="hunt-v2-score-side hunt-v2-score-side--tracer">
        <span className="hunt-v2-score-role">
          <GameIcon name="search" size={18} /> Tracer
        </span>
        <strong>{view.score.tracer}</strong>
        <div
          className="hunt-v2-round-marks"
          aria-label={`Tracer has won ${view.score.tracer} rounds`}
        >
          {view.roundResults.map((result) => (
            <span
              key={`tracer-${result.roundIndex}`}
              className={result.winner === 'tracer' ? 'is-won' : 'is-lost'}
            >
              {result.winner === 'tracer' ? 'T' : '·'}
            </span>
          ))}
        </div>
      </div>
    </header>
  );
}

function Entry({
  role,
  onRole,
  busy,
  onStart,
  onJoin,
}: {
  role: HuntV2Role;
  onRole: (role: HuntV2Role) => void;
  busy: boolean;
  onStart: () => void;
  onJoin: (matchId: string) => void;
}) {
  const [joinMatchId, setJoinMatchId] = useState('');
  return (
    <section className="hunt-v2-entry" aria-labelledby="hunt-v2-entry-title">
      <div className="hunt-v2-entry__eyebrow">
        <span className="hunt-v2-sonar-dot" /> WHALE HUNT · HIDE AND CATCH
      </div>
      <div className="hunt-v2-entry__hero">
        <div>
          <h1 id="hunt-v2-entry-title">
            The chart is the <em>arena.</em>
          </h1>
          <p>
            One whale hides a trade. One tracer reads the footprint. First to three points owns the
            current.
          </p>
        </div>
        <div className="hunt-v2-entry__rule">
          <strong>3 zones</strong>
          <span>5 scored rounds max</span>
          <span>2 scan charges</span>
        </div>
      </div>
      <div className="hunt-v2-role-intro">
        <span className="hunt-ui__eyebrow">CHOOSE YOUR SIDE</span>
        <p>
          {ROLE_COPY[role].title} {ROLE_COPY[role].detail}
        </p>
      </div>
      <div className="hunt-v2-role-cards" role="group" aria-label="Hunt role">
        {(['whale', 'tracer'] as const).map((candidate) => (
          <button
            key={candidate}
            className={`hunt-v2-role-card ${role === candidate ? 'is-selected' : ''}`}
            type="button"
            aria-pressed={role === candidate}
            onClick={() => onRole(candidate)}
          >
            <span className={`hunt-v2-role-card__mark hunt-v2-role-card__mark--${candidate}`}>
              {candidate === 'whale' ? <WhaleSilhouette /> : <GameIcon name="search" size={28} />}
            </span>
            <span>
              <strong>{roleLabel(candidate)}</strong>
              <small>
                {candidate === 'whale'
                  ? 'Hide your trade. Make the tracer choose wrong.'
                  : 'Read the activity. Find the whale.'}
              </small>
            </span>
            <span className="hunt-v2-role-card__state">
              {role === candidate ? 'Selected' : 'Choose'}
            </span>
          </button>
        ))}
      </div>
      <button className="hunt-v2-primary" type="button" disabled={busy} onClick={onStart}>
        <span>Enter the arena</span>
        <GameIcon name="arrow" size={18} />
      </button>
      <div className="hunt-v2-join">
        <div>
          <span className="hunt-ui__eyebrow">JOIN A HUMAN DUEL</span>
          <p>Paste a match ID from another player to take the open opponent seat.</p>
        </div>
        <form
          className="hunt-v2-join__form"
          onSubmit={(event) => {
            event.preventDefault();
            if (joinMatchId.trim()) onJoin(joinMatchId.trim());
          }}
        >
          <label className="hunt-v2-sr-only" htmlFor="hunt-v2-match-id">
            Match ID
          </label>
          <input
            id="hunt-v2-match-id"
            value={joinMatchId}
            onChange={(event) => setJoinMatchId(event.target.value)}
            placeholder="Match ID"
            autoComplete="off"
            disabled={busy}
          />
          <button
            className="hunt-v2-secondary"
            type="submit"
            disabled={busy || !joinMatchId.trim()}
          >
            Join duel
          </button>
        </form>
      </div>
      <p className="hunt-v2-entry__fineprint">
        Solo practice against a computer opponent · provider snapshots when live mode is enabled ·
        no wallet needed
      </p>
    </section>
  );
}

function WindowCard({
  window,
  selected,
  onSelect,
  disabled,
  label,
}: {
  window: HuntV2Window;
  selected: boolean;
  onSelect: () => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      className={`hunt-map-card ${selected ? 'is-selected' : ''}`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onSelect}
    >
      <span className="hunt-map-card__topline">
        <strong>ZONE {window.zone}</strong>
        <span>
          {window.market
            ? `${window.market.symbol} · ${window.market.chain}`
            : (label ?? 'MARKET WINDOW')}
        </span>
      </span>
      <MarketChart window={window} selected={selected} revealed={false} />
      {window.market && (
        <span className="hunt-map-card__signal">
          Smart money: {window.market.smartMoney.direction}
        </span>
      )}
      <span className="hunt-map-card__footer">
        {selected ? (label ?? `Target: ${window.zone}`) : 'Select window'}{' '}
        <GameIcon name={selected ? 'check' : 'chevron'} size={16} />
      </span>
    </button>
  );
}
function ArenaBoard({
  view,
  selectedZone,
  onSelect,
  disabled,
  selectionLabel,
}: {
  view: HuntV2MatchView;
  selectedZone: HuntV2Zone | null;
  onSelect: (zone: HuntV2Zone) => void;
  disabled?: boolean;
  selectionLabel?: string;
}) {
  return (
    <section className="hunt-board" aria-label="Three window chart arena">
      <div className="hunt-board__heading">
        <div>
          <span className="hunt-ui__eyebrow">PUBLIC CHART ARENA</span>
          <h2>Where is the footprint?</h2>
        </div>
        <span className="hunt-board__scale">A · B · C / SHARED SCALE</span>
      </div>
      <div className="hunt-board__windows">
        {view.windows.map((window) => (
          <WindowCard
            key={window.zone}
            window={window}
            selected={selectedZone === window.zone}
            onSelect={() => onSelect(window.zone)}
            disabled={disabled}
            label={selectedZone === window.zone ? selectionLabel : undefined}
          />
        ))}
      </div>
    </section>
  );
}

function WhaleControls({
  draftZone,
  draftMove,
  draftDecoy,
  busy,
  onZone,
  onMove,
  onDecoy,
  onHide,
}: {
  view: HuntV2MatchView;
  draftZone: HuntV2Zone;
  draftMove: HuntV2Move;
  draftDecoy: HuntV2Zone;
  busy: boolean;
  onZone: (zone: HuntV2Zone) => void;
  onMove: (move: HuntV2Move) => void;
  onDecoy: (zone: HuntV2Zone) => void;
  onHide: () => void;
}) {
  const effect =
    draftMove === 'decoy'
      ? `Decoy in ${draftZone} — leave a larger superficial pulse in ${draftDecoy}.`
      : `${MOVE_COPY[draftMove].title} in ${draftZone} — ${MOVE_COPY[draftMove].detail}`;
  return (
    <section className="hunt-v2-action-area" aria-labelledby="whale-action-title">
      <div className="hunt-v2-action-heading">
        <div>
          <span className="hunt-ui__eyebrow">WHALE HIDE DECK</span>
          <h2 id="whale-action-title">Choose the footprint.</h2>
        </div>
        <span className="hunt-v2-private">
          <GameIcon name="lock" size={14} /> PRIVATE PLAN
        </span>
      </div>
      <p className="hunt-v2-objective">Hide your trade. Make the tracer choose the wrong zone.</p>
      <div className="hunt-v2-control-row">
        <span className="hunt-v2-control-label">1 · HIDE IN</span>
        <div className="hunt-v2-choice-group">
          {HUNT_V2_ZONES.map((zone) => (
            <button
              key={zone}
              type="button"
              className={draftZone === zone ? 'is-selected' : ''}
              onClick={() => onZone(zone)}
              disabled={busy}
            >
              Zone {zone}
            </button>
          ))}
        </div>
      </div>
      <div className="hunt-v2-control-row">
        <span className="hunt-v2-control-label">2 · MOVE</span>
        <div className="hunt-v2-move-cards">
          {(['burst', 'drip', 'blend', 'decoy', 'wait'] as const).map((move) => (
            <button
              key={move}
              type="button"
              className={`hunt-v2-move-card ${draftMove === move ? 'is-selected' : ''}`}
              onClick={() => onMove(move)}
              disabled={busy}
            >
              <strong>{MOVE_COPY[move].title}</strong>
              <span>{MOVE_COPY[move].detail}</span>
            </button>
          ))}
        </div>
      </div>
      {draftMove === 'decoy' && (
        <div className="hunt-v2-control-row">
          <span className="hunt-v2-control-label">3 · DECOY PULSE</span>
          <div className="hunt-v2-choice-group">
            {HUNT_V2_ZONES.filter((zone) => zone !== draftZone).map((zone) => (
              <button
                key={zone}
                type="button"
                className={`hunt-footprint-preview--decoy ${draftDecoy === zone ? 'is-selected' : ''}`}
                onClick={() => onDecoy(zone)}
                disabled={busy}
              >
                Pulse in {zone}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="hunt-v2-preview" aria-live="polite">
        <WhaleSilhouette />
        <span>
          <strong>Preview</strong>
          {effect}
        </span>
      </div>
      <button
        className="hunt-v2-primary hunt-v2-primary--amber"
        type="button"
        onClick={onHide}
        disabled={busy}
      >
        {busy ? 'Hiding…' : `Hide here: ${draftZone}`} <GameIcon name="arrow" size={18} />
      </button>
    </section>
  );
}

function EvidenceStrip({ view }: { view: HuntV2MatchView }) {
  const latest = view.scans.at(-1);
  return (
    <section className="hunt-v2-evidence" aria-live="polite" aria-label="Investigation evidence">
      <div className="hunt-v2-evidence__head">
        <span className="hunt-ui__eyebrow">EVIDENCE STRIP</span>
        <span>
          Scans remaining: <strong>{view.scansRemaining}</strong>
        </span>
      </div>
      {latest ? (
        <div className="hunt-v2-evidence__result">
          <span className="hunt-v2-evidence__tag">
            ZONE {latest.zone} · {latest.kind.toUpperCase()}
          </span>
          <strong>{latest.headline}</strong>
          <p>{latest.detail}</p>
          <div className="hunt-v2-evidence__metrics">
            {latest.metrics.map((metric) => (
              <span key={metric.label}>
                <small>{metric.label}</small>
                <b>{metric.value}</b>
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="hunt-v2-evidence__empty">
          Scans appear here beside the chart. Each result explains the observation in plain
          language.
        </p>
      )}
      {view.scans.length > 1 && (
        <div className="hunt-v2-evidence__history">
          {view.scans.slice(0, -1).map((scan) => (
            <span key={`${scan.zone}-${scan.kind}`}>
              Zone {scan.zone} · {scan.kind}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
function TracerControls({
  view,
  targetZone,
  scanZone,
  busy,
  onScanZone,
  onScan,
  onCatch,
}: {
  view: HuntV2MatchView;
  targetZone: HuntV2Zone;
  scanZone: HuntV2Zone;
  busy: boolean;
  onScanZone: (zone: HuntV2Zone) => void;
  onScan: (scan: HuntV2ScanKind) => void;
  onCatch: () => void;
}) {
  return (
    <section className="hunt-v2-action-area" aria-labelledby="tracer-action-title">
      <div className="hunt-v2-action-heading">
        <div>
          <span className="hunt-ui__eyebrow">TRACER TOOLKIT</span>
          <h2 id="tracer-action-title">Observe, scan, commit.</h2>
        </div>
        <span className="hunt-v2-private hunt-v2-private--cyan">
          <GameIcon name="search" size={14} /> PUBLIC SIGNAL
        </span>
      </div>
      <p className="hunt-v2-objective">Read the activity. Find the whale. Lock your catch.</p>
      <EvidenceStrip view={view} />
      <div className="hunt-v2-control-row">
        <span className="hunt-v2-control-label">SCAN ZONE</span>
        <div className="hunt-v2-choice-group">
          {HUNT_V2_ZONES.map((zone) => (
            <button
              key={zone}
              type="button"
              className={scanZone === zone ? 'is-selected' : ''}
              onClick={() => onScanZone(zone)}
              disabled={busy}
            >
              Zone {zone}
            </button>
          ))}
        </div>
      </div>
      <div className="hunt-v2-scan-buttons">
        {(
          ['flow', 'concentration', 'rhythm', 'timing', 'cross-asset', 'position-growth'] as const
        ).map((scan) => (
          <button
            key={scan}
            type="button"
            onClick={() => onScan(scan)}
            disabled={busy || view.scansRemaining === 0}
          >
            {SCAN_COPY[scan].title} <small>{SCAN_COPY[scan].detail}</small>
          </button>
        ))}
      </div>
      <div className="hunt-v2-target-lock">
        <span>
          Target: <strong>{targetZone}</strong>
        </span>
        <button className="hunt-v2-primary" type="button" onClick={onCatch} disabled={busy}>
          {busy ? 'Locking…' : `Lock catch: ${targetZone}`} <GameIcon name="arrow" size={18} />
        </button>
      </div>
    </section>
  );
}

function RoundReveal({
  view,
  busy,
  onRematch,
}: {
  view: HuntV2MatchView;
  busy: boolean;
  onRematch: () => void;
}) {
  const result = view.roundResult;
  if (!result) return null;
  const matchOver = view.phase === 'match_over';
  return (
    <section
      className={`hunt-v2-reveal ${result.winner === view.role ? 'is-your-win' : ''}`}
      aria-live="assertive"
    >
      <div className="hunt-v2-reveal__impact">
        <span>
          {result.winner === view.role
            ? 'YOU WIN THE ROUND'
            : `${roleLabel(result.winner)} WINS THE ROUND`}
        </span>
        <strong>
          {result.reason === 'caught'
            ? 'CAUGHT'
            : result.reason === 'escaped'
              ? 'ESCAPED'
              : result.reason.replace('-', ' ').toUpperCase()}
        </strong>
      </div>
      <div className="hunt-v2-reveal__facts">
        <div>
          <small>Whale hid in</small>
          <strong>Zone {result.hiddenZone}</strong>
        </div>
        <div>
          <small>Tracer selected</small>
          <strong>{result.selectedZone ? `Zone ${result.selectedZone}` : 'No catch'}</strong>
        </div>
        <div>
          <small>Point awarded</small>
          <strong>{result.winner === 'whale' ? 'Whale +1' : 'Tracer +1'}</strong>
        </div>
      </div>
      <p>{result.explanation}</p>
      {matchOver ? (
        <div className="hunt-v2-reveal__match">
          <strong>{view.matchWinner === view.role ? 'Match won.' : 'Match lost.'}</strong>
          <span>Rematch swaps the roles.</span>
          <button className="hunt-v2-primary" type="button" onClick={onRematch} disabled={busy}>
            {busy ? 'Preparing…' : 'Rematch · Swap roles'} <GameIcon name="arrow" size={18} />
          </button>
        </div>
      ) : (
        <div className="hunt-v2-reveal__next">Next round is loading from the server…</div>
      )}
    </section>
  );
}

function MatchScreen({
  view,
  now,
  busy,
  error,
  onCommand,
  onRematch,
}: {
  view: HuntV2MatchView;
  now: number;
  busy: boolean;
  error: string;
  onCommand: (command: Omit<HuntV2Command, 'expectedStateVersion' | 'idempotencyKey'>) => void;
  onRematch: () => void;
}) {
  const [draftZone, setDraftZone] = useState<HuntV2Zone>(view.whaleSelection?.zone ?? 'B');
  const [draftMove, setDraftMove] = useState<HuntV2Move>(view.whaleSelection?.move ?? 'blend');
  const [draftDecoy, setDraftDecoy] = useState<HuntV2Zone>(view.whaleSelection?.decoyZone ?? 'A');
  const [targetZone, setTargetZone] = useState<HuntV2Zone>(view.selectedZone ?? 'B');
  const [scanZone, setScanZone] = useState<HuntV2Zone>('B');
  useEffect(() => {
    if (view.whaleSelection) {
      setDraftZone(view.whaleSelection.zone);
      setDraftMove(view.whaleSelection.move);
      if (view.whaleSelection.decoyZone) setDraftDecoy(view.whaleSelection.decoyZone);
    }
    if (view.selectedZone) setTargetZone(view.selectedZone);
  }, [view.whaleSelection, view.selectedZone]);
  return (
    <section className="hunt-v2-match" aria-label="Whale Hunt match">
      <ScoreHeader view={view} now={now} />
      <div className="hunt-v2-turn-banner">
        <span className={`hunt-v2-turn-dot hunt-v2-turn-dot--${view.role}`} />
        <div>
          <strong>{phaseMessage(view)}</strong>
          <span>
            {roleLabel(view.role)} seat · server time remaining {formatRemaining(view, now)} · Match{' '}
            {view.matchId}
          </span>
        </div>
        <button
          className="hunt-v2-mute"
          type="button"
          aria-label="Mute optional Hunt sound cues"
          title="Sound cues are muted by default"
        >
          <GameIcon name="volume" size={17} />
        </button>
      </div>
      {error && (
        <div className="hunt-v2-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => window.location.reload()}>
            Reconnect
          </button>
        </div>
      )}
      <div className="hunt-v2-arena-wrap">
        <ArenaBoard
          view={view}
          selectedZone={
            view.role === 'whale' && view.phase === 'whale_hide'
              ? draftZone
              : view.role === 'tracer' && view.phase === 'tracer_hunt'
                ? targetZone
                : (view.roundResult?.hiddenZone ?? null)
          }
          onSelect={
            view.role === 'whale' && view.phase === 'whale_hide' ? setDraftZone : setTargetZone
          }
          disabled={view.phase !== 'whale_hide' && view.phase !== 'tracer_hunt'}
          selectionLabel={
            view.role === 'tracer' ? `Target: ${targetZone}` : `Private marker: ${draftZone}`
          }
        />
        {view.phase === 'round_intro' && (
          <div className="hunt-v2-phase-card">
            <span className="hunt-v2-phase-card__round">ROUND {view.roundIndex}</span>
            <h2>Read the current.</h2>
            <p>
              {ROLE_COPY[view.role].title} {ROLE_COPY[view.role].detail}
            </p>
            <span>Briefing ends in {formatRemaining(view, now)}</span>
          </div>
        )}
        {view.role === 'whale' && view.phase === 'whale_hide' && (
          <WhaleControls
            view={view}
            draftZone={draftZone}
            draftMove={draftMove}
            draftDecoy={draftDecoy}
            busy={busy}
            onZone={setDraftZone}
            onMove={setDraftMove}
            onDecoy={setDraftDecoy}
            onHide={() =>
              onCommand({
                kind: 'select-whale-plan',
                zone: draftZone,
                move: draftMove,
                ...(draftMove === 'decoy' ? { decoyZone: draftDecoy } : {}),
              })
            }
          />
        )}
        {view.role === 'tracer' && view.phase === 'tracer_hunt' && (
          <TracerControls
            view={view}
            targetZone={targetZone}
            scanZone={scanZone}
            busy={busy}
            onScanZone={setScanZone}
            onScan={(scan) => onCommand({ kind: 'scan', zone: scanZone, scan })}
            onCatch={() => onCommand({ kind: 'lock-catch', zone: targetZone })}
          />
        )}
        {view.role === 'whale' && view.phase === 'tracer_hunt' && (
          <section className="hunt-v2-waiting">
            <span className="hunt-v2-waiting__icon">
              <GameIcon name="search" size={22} />
            </span>
            <strong>Tracer is investigating</strong>
            <p>Public scans appear in the evidence strip. Your hidden marker stays private.</p>
          </section>
        )}
        {view.role === 'tracer' && view.phase === 'whale_hide' && (
          <section className="hunt-v2-waiting">
            <span className="hunt-v2-waiting__icon">
              <WhaleSilhouette />
            </span>
            <strong>Whale is hiding</strong>
            <p>The hunt starts when the whale confirms a zone and move.</p>
          </section>
        )}
        {(view.phase === 'round_reveal' || view.phase === 'match_over') && (
          <RoundReveal view={view} busy={busy} onRematch={onRematch} />
        )}
      </div>
      <p className="hunt-v2-disclaimer">
        Provider or synthetic chart activity · server-authoritative points · optional cues respect
        reduced motion
      </p>
    </section>
  );
}

export function HuntScreen({
  initialRole = 'tracer',
  initialMatch,
  matchId: initialMatchId,
  transport,
}: HuntScreenProps = {}) {
  const api = useMemo(() => transport ?? createHuntV2ApiTransport(), [transport]);
  const [role, setRole] = useState<HuntV2Role>(initialRole);
  const [match, setMatch] = useState<HuntV2MatchView | null>(initialMatch ?? null);
  const [matchId, setMatchId] = useState<string | null>(
    initialMatchId ?? initialMatch?.matchId ?? null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!matchId) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const next = await api.getMatch(matchId);
        if (!cancelled) {
          setMatch(next);
          setRole(next.role);
          setError('');
        }
      } catch (caught) {
        if (!cancelled)
          setError(caught instanceof Error ? caught.message : 'Could not restore the Hunt.');
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 800);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [api, matchId]);
  async function start() {
    setBusy(true);
    setError('');
    try {
      const next = await api.createMatch({ role, idempotencyKey: `hunt-v2-create-${Date.now()}` });
      setMatch(next);
      setMatchId(next.matchId);
      try {
        window.sessionStorage.setItem('whale-arena.hunt.v2.match', next.matchId);
      } catch {
        /* optional */
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not enter the Hunt.');
    } finally {
      setBusy(false);
    }
  }
  async function join(requestedMatchId: string) {
    setBusy(true);
    setError('');
    try {
      const next = await api.joinMatch(requestedMatchId, `hunt-v2-join-${Date.now()}`);
      setMatch(next);
      setMatchId(next.matchId);
      setRole(next.role);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not join the Hunt duel.');
    } finally {
      setBusy(false);
    }
  }
  async function send(command: Omit<HuntV2Command, 'expectedStateVersion' | 'idempotencyKey'>) {
    if (!matchId || !match || busy) return;
    setBusy(true);
    setError('');
    try {
      let next = await api.command(matchId, {
        ...command,
        ...commandMeta(match, command.kind),
      } as HuntV2Command);
      if (command.kind === 'select-whale-plan')
        next = await api.command(matchId, {
          kind: 'hide-trade',
          ...commandMeta(next, 'hide-trade'),
        });
      setMatch(next);
    } catch (caught) {
      if (caught instanceof HuntV2ApiError && caught.stateVersion !== undefined) {
        try {
          setMatch(await api.getMatch(matchId));
        } catch {
          /* retain error */
        }
      }
      setError(caught instanceof Error ? caught.message : 'That Hunt action was not accepted.');
    } finally {
      setBusy(false);
    }
  }
  async function rematch() {
    if (!matchId || busy) return;
    setBusy(true);
    setError('');
    try {
      const next = await api.rematch(matchId, `hunt-v2-rematch-${Date.now()}`);
      setMatch(next);
      setMatchId(next.matchId);
      setRole(next.role);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The rematch could not start.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="whale-hunt">
      <div className="hunt-v2-shell">
        {!match ? (
          <Entry
            role={role}
            onRole={setRole}
            busy={busy}
            onStart={() => void start()}
            onJoin={(requestedMatchId) => void join(requestedMatchId)}
          />
        ) : (
          <MatchScreen
            view={match}
            now={now}
            busy={busy}
            error={error}
            onCommand={(command) => void send(command)}
            onRematch={() => void rematch()}
          />
        )}
      </div>
    </div>
  );
}

// Compatibility copy kept in source for saved v1 screenshots and documentation links.
const LEGACY_V1_PRIVACY_FIELD = 'view.ownTargets';
function TracerPanel() {
  return null;
}
function HuntRevealPanel() {
  return null;
}
const LEGACY_HUNT_COPY = [
  'Build your position. Leave them chasing the wrong trail.',
  'Read the footprints. Find the hidden targets.',
  'Finding players… computers join in 8 seconds.',
  'Six locations. One hidden pattern.',
  'Finish investigating',
  'FINAL RECONSTRUCTION',
  'Skip reveal animation',
  'Rematch',
  'Swap roles',
];
void LEGACY_V1_PRIVACY_FIELD;
void LEGACY_HUNT_COPY;
