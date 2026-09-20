import type { CSSProperties, ReactNode } from 'react';
import type {
  EvidenceAttribution,
  EvidenceCategory,
  EvidenceCoverage,
  PublicAssetEvidence,
  RevealedClue,
  UnopenedClueDescriptor,
} from '../../shared/evidence.js';
import type { DailyTicketResult } from '../../shared/daily-five.js';
import {
  categoryIcon,
  classNames,
  cssVars,
  EVIDENCE_CATEGORY_LABELS,
  fixedDisplayMoney,
  formatIndexDelta,
  GameIcon,
  getSharedChartScale,
  normalizeToStartingIndex,
  type ChartPoint,
  type ChartScale,
  type GameUiNamespace,
  type GameUiState,
  type UiNamespaceProps,
  uiRoot,
} from './primitives.js';

function stateLabel(state: GameUiState): string {
  if (state === 'loading') return 'Loading';
  if (state === 'empty') return 'Empty';
  if (state === 'unavailable') return 'Unavailable';
  if (state === 'locked') return 'Locked';
  if (state === 'revealed') return 'Revealed';
  if (state === 'selected') return 'Selected';
  return 'Ready';
}

function stateClass(state: GameUiState | undefined): string {
  return state && state !== 'default' ? `is-${state}` : '';
}

export interface PriceChartProps {
  preDecision?: readonly ChartPoint[];
  values?: readonly (number | string)[];
  revealed?: readonly ChartPoint[];
  scale?: ChartScale;
  cutoffAt?: string;
  cutoffIndex?: number;
  liquidationIndices?: readonly number[];
  label?: string;
  accent?: string;
  state?: GameUiState;
  namespace?: GameUiNamespace;
  className?: string;
}

function chartPath(values: readonly number[], scale: ChartScale, width = 300, height = 110) {
  const innerWidth = width - 16;
  const top = 12;
  const bottom = height - 20;
  return values
    .map((value, index) => {
      const x = 8 + (index / Math.max(values.length - 1, 1)) * innerWidth;
      const ratio = (value - scale.min) / Math.max(scale.max - scale.min, Number.EPSILON);
      const y = bottom - Math.max(0, Math.min(1, ratio)) * (bottom - top);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

function chartX(index: number, count: number, width = 300): number {
  return 8 + (index / Math.max(count - 1, 1)) * (width - 16);
}

export function PriceChart({
  preDecision,
  values,
  revealed = [],
  scale,
  cutoffAt,
  cutoffIndex,
  liquidationIndices = [],
  label = 'Price chart',
  accent = 'var(--game-ui-accent)',
  state = 'default',
  namespace,
  className,
}: PriceChartProps) {
  const source = preDecision ?? (values ?? []).map((value) => ({ value }));
  if (state === 'loading') {
    return (
      <div
        className={uiRoot(namespace, classNames('game-ui__chart', 'is-loading', className))}
        aria-busy="true"
      >
        <span>Loading chart…</span>
      </div>
    );
  }
  if (state === 'empty' || (source.length === 0 && revealed.length === 0)) {
    return (
      <div
        className={uiRoot(namespace, classNames('game-ui__chart', 'is-empty', className))}
        role="img"
        aria-label={`${label}: no chart data`}
      >
        <GameIcon name="pulse" size={20} />
        <span>No chart data published</span>
      </div>
    );
  }
  if (state === 'unavailable') {
    return (
      <div
        className={uiRoot(namespace, classNames('game-ui__chart', 'is-unavailable', className))}
        role="img"
        aria-label={`${label}: chart unavailable`}
      >
        <GameIcon name="alert" size={20} />
        <span>Chart unavailable</span>
      </div>
    );
  }

  const preValues = normalizeToStartingIndex(source.map((point) => point.value));
  const outcomeValues = normalizeToStartingIndex(revealed.map((point) => point.value));
  const allValues = outcomeValues.length ? [...preValues, ...outcomeValues] : preValues;
  const chartScale =
    scale ??
    getSharedChartScale([source.map((point) => point.value), revealed.map((point) => point.value)]);
  const count = allValues.length;
  const cutoff = cutoffIndex ?? (outcomeValues.length ? preValues.length - 1 : undefined);
  const outcomePath = outcomeValues.length
    ? chartPath([preValues.at(-1)!, ...outcomeValues], chartScale)
    : '';
  const ariaSummary = `${label}. Display starts at index 100. Range ${formatIndexDelta(chartScale.min)} to ${formatIndexDelta(chartScale.max)}.${cutoff !== undefined ? ' Decision cutoff shown.' : ''}`;

  return (
    <div
      className={uiRoot(namespace, classNames('game-ui__chart', stateClass(state), className))}
      style={{ '--chart-accent': accent } as CSSProperties}
    >
      <svg viewBox="0 0 300 110" preserveAspectRatio="none" role="img" aria-label={ariaSummary}>
        <title>{ariaSummary}</title>
        {[24, 48, 72].map((y) => (
          <line key={y} className="game-ui__chart-grid" x1="8" x2="292" y1={y} y2={y} />
        ))}
        <text className="game-ui__chart-scale" x="8" y="104">
          {formatIndexDelta(chartScale.min)}
        </text>
        <text className="game-ui__chart-scale" x="292" y="104" textAnchor="end">
          {formatIndexDelta(chartScale.max)}
        </text>
        <polyline className="game-ui__chart-prior" points={chartPath(preValues, chartScale)} />
        {outcomePath && <polyline className="game-ui__chart-outcome" points={outcomePath} />}
        {cutoff !== undefined && (
          <g className="game-ui__chart-cutoff">
            <line x1={chartX(cutoff, count)} x2={chartX(cutoff, count)} y1="8" y2="91" />
            <text x={chartX(cutoff, count) + 5} y="14">
              CUTOFF
            </text>
          </g>
        )}
        {liquidationIndices.map((index) => {
          const value = allValues[index];
          if (value === undefined) return null;
          const point = chartPath([value], chartScale).split(',');
          const x = chartX(index, count);
          const ratio =
            (value - chartScale.min) / Math.max(chartScale.max - chartScale.min, Number.EPSILON);
          const y = 92 - Math.max(0, Math.min(1, ratio)) * 80;
          return (
            <g className="game-ui__liquidation" key={index} data-liquidation-candle="true">
              <line x1={x} x2={x} y1="8" y2="94" />
              <circle cx={x} cy={y} r="4" />
              <title>Liquidation candle evaluated</title>
              {point.length === 0 && null}
            </g>
          );
        })}
      </svg>
      <div className="game-ui__chart-key" aria-hidden="true">
        <span>
          <i className="prior" /> Before cutoff
        </span>
        {revealed.length > 0 && (
          <span>
            <i className="outcome" /> Revealed outcome
          </span>
        )}
        {liquidationIndices.length > 0 && (
          <span>
            <i className="liquidation" /> Evaluated liquidation candle
          </span>
        )}
      </div>
      {cutoffAt && (
        <span className="game-ui__chart-caption">
          Decision cutoff · {new Date(cutoffAt).toUTCString()}
        </span>
      )}
    </div>
  );
}

export interface AssetMiniCardProps {
  asset: PublicAssetEvidence;
  chartScale?: ChartScale;
  selected?: boolean;
  state?: GameUiState;
  onSelect?: () => void;
  onOpenClues?: () => void;
  namespace?: GameUiNamespace;
  className?: string;
}

export function AssetMiniCard({
  asset,
  chartScale,
  selected = false,
  state = 'default',
  onSelect,
  onOpenClues,
  namespace = 'daily-five',
  className,
}: AssetMiniCardProps) {
  if (state === 'empty') {
    return (
      <article
        className={uiRoot(namespace, classNames('game-ui__asset-card', 'is-empty', className))}
      >
        <GameIcon name="search" size={22} />
        <h3>No asset published</h3>
        <p>There is no public candidate for this slot.</p>
      </article>
    );
  }
  const title = asset.attemptAlias || 'Mystery asset';
  const cardLabel = `${title}, ${stateLabel(state)}${selected ? ', selected' : ''}`;
  return (
    <article
      className={uiRoot(
        namespace,
        classNames('game-ui__asset-card', stateClass(state), selected && 'is-selected', className),
      )}
      style={cssVars(asset.colorIndex)}
      aria-label={cardLabel}
    >
      <div className="game-ui__asset-card-topline">
        <span className="game-ui__asset-index">0{asset.colorIndex + 1}</span>
        <span className="game-ui__asset-kind">MYSTERY ASSET</span>
        <span className="game-ui__asset-status">{stateLabel(state)}</span>
      </div>
      <div className="game-ui__asset-card-heading">
        {onSelect ? (
          <button
            className="game-ui__asset-select"
            type="button"
            aria-pressed={selected}
            aria-label={`Select ${title}`}
            disabled={state === 'locked' || state === 'loading' || state === 'unavailable'}
            onClick={onSelect}
          >
            <span className="game-ui__asset-orb" aria-hidden="true">
              ◈
            </span>
            <span>
              <strong>{title}</strong>
              <small>Public alias · outcome independent</small>
            </span>
          </button>
        ) : (
          <div className="game-ui__asset-select is-static">
            <span className="game-ui__asset-orb" aria-hidden="true">
              ◈
            </span>
            <span>
              <strong>{title}</strong>
              <small>Public alias · outcome independent</small>
            </span>
          </div>
        )}
        <span className="game-ui__asset-accent" aria-hidden="true" />
      </div>
      <PriceChart
        preDecision={asset.chart}
        scale={chartScale}
        label={`${title} pre-decision chart`}
        namespace={namespace}
        accent="var(--asset-accent)"
        state={
          state === 'unavailable' ? 'unavailable' : state === 'loading' ? 'loading' : 'default'
        }
      />
      <div className="game-ui__asset-card-footer">
        <span>PRE-CUTOFF SERIES</span>
        {onOpenClues ? (
          <button type="button" className="game-ui__text-button" onClick={onOpenClues}>
            View evidence <GameIcon name="arrow" size={14} />
          </button>
        ) : (
          <span>{asset.clueDescriptors.length} clue categories</span>
        )}
      </div>
    </article>
  );
}

export interface ClueTileProps {
  clue: UnopenedClueDescriptor | RevealedClue;
  state?: GameUiState;
  selected?: boolean;
  onActivate?: () => void;
  namespace?: GameUiNamespace;
  className?: string;
}

export function ClueTile({
  clue,
  state = 'default',
  selected = false,
  onActivate,
  namespace = 'daily-five',
  className,
}: ClueTileProps) {
  const revealed = 'factualHeadline' in clue;
  const effectiveState = revealed && state === 'default' ? 'revealed' : state;
  const label = EVIDENCE_CATEGORY_LABELS[clue.category];
  const text = revealed ? clue.factualHeadline : clue.question;
  const disabled = !onActivate || effectiveState === 'loading' || effectiveState === 'unavailable';
  return (
    <button
      type="button"
      className={uiRoot(
        namespace,
        classNames(
          'game-ui__clue-tile',
          stateClass(effectiveState),
          selected && 'is-selected',
          className,
        ),
      )}
      aria-pressed={selected}
      aria-label={`${revealed ? 'Open' : 'Unlock'} ${label} clue${selected ? ', selected' : ''}`}
      disabled={disabled}
      onClick={onActivate}
    >
      <span className="game-ui__clue-icon">
        <GameIcon name={categoryIcon(clue.category)} size={18} />
      </span>
      <span className="game-ui__clue-copy">
        <strong>{label}</strong>
        <span>{text}</span>
      </span>
      <span className="game-ui__clue-state">
        <span>{stateLabel(effectiveState)}</span>
        <GameIcon name={revealed ? 'chevron' : 'lock'} size={15} />
      </span>
    </button>
  );
}

export interface CluePanelProps extends UiNamespaceProps {
  clues: readonly UnopenedClueDescriptor[];
  unlockedClues?: readonly RevealedClue[];
  unlocksRemaining: number;
  selectedClueId?: string;
  busyClueId?: string;
  unavailable?: boolean;
  onUnlock?: (clue: UnopenedClueDescriptor) => void | Promise<void>;
  onSelect?: (clue: RevealedClue) => void;
}

export function CluePanel({
  clues,
  unlockedClues = [],
  unlocksRemaining,
  selectedClueId,
  busyClueId,
  unavailable = false,
  onUnlock,
  onSelect,
  namespace = 'daily-five',
  className,
}: CluePanelProps) {
  if (unavailable || clues.length === 0) {
    return (
      <section
        className={uiRoot(
          namespace,
          classNames('game-ui__clue-panel', unavailable ? 'is-unavailable' : 'is-empty', className),
        )}
        aria-live="polite"
      >
        <div className="game-ui__panel-heading">
          <GameIcon name={unavailable ? 'alert' : 'search'} size={18} />
          <span>Evidence panel</span>
        </div>
        <p>
          {unavailable
            ? 'Evidence is unavailable for this published window.'
            : 'No clue categories have been published.'}
        </p>
      </section>
    );
  }
  const unlockedById = new Map(unlockedClues.map((clue) => [clue.clueId, clue]));
  return (
    <section
      className={uiRoot(namespace, classNames('game-ui__clue-panel', className))}
      aria-labelledby="game-ui-clue-panel-title"
    >
      <div className="game-ui__panel-heading">
        <div>
          <span className="game-ui__eyebrow">EVIDENCE BOARD</span>
          <h3 id="game-ui-clue-panel-title">What did the window show?</h3>
        </div>
        <ClueBudget remaining={unlocksRemaining} namespace={namespace} />
      </div>
      <div className="game-ui__clue-list">
        {clues.map((clue) => {
          const revealed = unlockedById.get(clue.clueId);
          const busy = busyClueId === clue.clueId;
          return (
            <ClueTile
              key={clue.clueId}
              clue={revealed ?? clue}
              state={
                busy
                  ? 'loading'
                  : selectedClueId === clue.clueId
                    ? 'selected'
                    : revealed
                      ? 'revealed'
                      : 'locked'
              }
              selected={selectedClueId === clue.clueId}
              namespace={namespace}
              onActivate={
                revealed
                  ? () => onSelect?.(revealed)
                  : unlocksRemaining > 0
                    ? () => onUnlock?.(clue)
                    : undefined
              }
            />
          );
        })}
      </div>
    </section>
  );
}

export interface ClueBudgetProps extends UiNamespaceProps {
  remaining: number;
  total?: number;
  state?: GameUiState;
}

export function ClueBudget({
  remaining,
  total = 3,
  state = 'default',
  namespace = 'daily-five',
  className,
}: ClueBudgetProps) {
  const safeRemaining = Math.max(0, Math.min(total, remaining));
  return (
    <div
      className={uiRoot(
        namespace,
        classNames('game-ui__clue-budget', stateClass(state), className),
      )}
      aria-label={`${safeRemaining} of ${total} clue unlocks remaining`}
    >
      <span className="game-ui__eyebrow">CLUE BUDGET</span>
      <div className="game-ui__budget-row">
        {Array.from({ length: total }, (_, index) => (
          <span
            className={classNames('game-ui__credit', index < safeRemaining && 'is-available')}
            key={index}
            aria-hidden="true"
          >
            <GameIcon name={index < safeRemaining ? 'pulse' : 'check'} size={14} />
          </span>
        ))}
        <strong>
          {safeRemaining}
          <small> / {total}</small>
        </strong>
      </div>
      <span className="game-ui__sr-only">{safeRemaining} unlocks available</span>
    </div>
  );
}

export interface DirectionToggleProps extends UiNamespaceProps {
  value: 'long' | 'short' | null;
  onChange?: (value: 'long' | 'short') => void;
  disabled?: boolean;
  state?: GameUiState;
}

export function DirectionToggle({
  value,
  onChange,
  disabled = false,
  state = 'default',
  namespace = 'daily-five',
  className,
}: DirectionToggleProps) {
  return (
    <fieldset
      className={uiRoot(
        namespace,
        classNames('game-ui__direction-toggle', stateClass(state), className),
      )}
      disabled={disabled || state === 'locked'}
    >
      <legend>Position direction</legend>
      <div role="radiogroup" aria-label="Position direction">
        {(['long', 'short'] as const).map((direction) => (
          <button
            type="button"
            role="radio"
            aria-checked={value === direction}
            className={classNames(
              'game-ui__direction-option',
              value === direction && 'is-selected',
              direction,
            )}
            key={direction}
            onClick={() => onChange?.(direction)}
          >
            <GameIcon name={direction} size={17} />
            <span>{direction === 'long' ? 'Long' : 'Short'}</span>
            <small>
              {direction === 'long' ? 'Benefit if price rises' : 'Benefit if price falls'}
            </small>
          </button>
        ))}
      </div>
      {state === 'locked' && (
        <span className="game-ui__control-note">
          <GameIcon name="lock" size={13} /> Direction locked after submission
        </span>
      )}
    </fieldset>
  );
}

export interface LeverageControlProps extends UiNamespaceProps {
  value: number;
  min?: number;
  max?: number;
  onChange?: (value: number) => void;
  disabled?: boolean;
  state?: GameUiState;
}

export function LeverageControl({
  value,
  min = 1,
  max = 100,
  onChange,
  disabled = false,
  state = 'default',
  namespace = 'daily-five',
  className,
}: LeverageControlProps) {
  const safeValue = Math.max(min, Math.min(max, value));
  const presets = [1, 2, 5, 10, 25, 50, 100].filter((preset) => preset >= min && preset <= max);
  return (
    <fieldset
      className={uiRoot(
        namespace,
        classNames('game-ui__leverage-control', stateClass(state), className),
      )}
      disabled={disabled || state === 'locked'}
    >
      <legend>Leverage</legend>
      <div className="game-ui__leverage-heading">
        <span>Exposure multiplier</span>
        <strong>{safeValue}×</strong>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step="1"
        value={safeValue}
        onChange={(event) => onChange?.(Number(event.target.value))}
        aria-label="Leverage multiplier"
        aria-valuetext={`${safeValue} times leverage`}
      />
      <div className="game-ui__leverage-scale" aria-hidden="true">
        <span>{min}×</span>
        <span>{max}×</span>
      </div>
      <div className="game-ui__leverage-presets" aria-label="Leverage presets">
        {presets.map((preset) => (
          <button
            type="button"
            key={preset}
            className={safeValue === preset ? 'is-selected' : ''}
            onClick={() => onChange?.(preset)}
          >
            {preset}×
          </button>
        ))}
      </div>
      {state === 'locked' && (
        <span className="game-ui__control-note">
          <GameIcon name="lock" size={13} /> Leverage locked after submission
        </span>
      )}
    </fieldset>
  );
}

export interface CapitalSummaryProps extends UiNamespaceProps {
  startingCapital?: string | number;
  roundStake?: string | number;
  remainingCapital?: string | number;
  ticketEquity?: string | number;
  returnPct?: string;
  state?: GameUiState;
}

export function CapitalSummary({
  startingCapital,
  roundStake,
  remainingCapital,
  ticketEquity,
  returnPct,
  state = 'default',
  namespace = 'daily-five',
  className,
}: CapitalSummaryProps) {
  if (state === 'loading')
    return (
      <section
        className={uiRoot(
          namespace,
          classNames('game-ui__capital-summary', 'is-loading', className),
        )}
        aria-busy="true"
      >
        Loading capital…
      </section>
    );
  if (state === 'empty')
    return (
      <section
        className={uiRoot(namespace, classNames('game-ui__capital-summary', 'is-empty', className))}
      >
        Capital summary appears after the attempt starts.
      </section>
    );
  if (state === 'unavailable')
    return (
      <section
        className={uiRoot(
          namespace,
          classNames('game-ui__capital-summary', 'is-unavailable', className),
        )}
        role="status"
      >
        Capital data unavailable.
      </section>
    );
  const values = [
    startingCapital !== undefined && ['Starting capital', fixedDisplayMoney(startingCapital)],
    roundStake !== undefined && ['This round', fixedDisplayMoney(roundStake)],
    remainingCapital !== undefined && ['Remaining capital', fixedDisplayMoney(remainingCapital)],
    ticketEquity !== undefined && ['Ticket equity', fixedDisplayMoney(ticketEquity)],
  ].filter(Boolean) as [string, string][];
  return (
    <section
      className={uiRoot(
        namespace,
        classNames('game-ui__capital-summary', stateClass(state), className),
      )}
      aria-label="Capital summary"
    >
      <div className="game-ui__panel-heading">
        <span className="game-ui__eyebrow">CAPITAL LEDGER</span>
        <GameIcon name="cash" size={18} />
      </div>
      <div className="game-ui__capital-grid">
        {values.map(([label, display]) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{display}</strong>
          </div>
        ))}
        {returnPct !== undefined && (
          <div>
            <span>Return</span>
            <strong className={returnPct.startsWith('-') ? 'is-negative' : 'is-positive'}>
              {returnPct}%
            </strong>
          </div>
        )}
      </div>
    </section>
  );
}

export interface RoundProgressProps extends UiNamespaceProps {
  currentRound: number;
  totalRounds: number;
  completedRounds?: number;
  state?: GameUiState;
}

export function RoundProgress({
  currentRound,
  totalRounds,
  completedRounds = currentRound - 1,
  state = 'default',
  namespace = 'daily-five',
  className,
}: RoundProgressProps) {
  const safeCurrent = Math.max(1, Math.min(totalRounds, currentRound));
  const safeCompleted = Math.max(0, Math.min(totalRounds, completedRounds));
  return (
    <nav
      className={uiRoot(
        namespace,
        classNames('game-ui__round-progress', stateClass(state), className),
      )}
      aria-label={`Round ${safeCurrent} of ${totalRounds}`}
      aria-busy={state === 'loading'}
    >
      <div className="game-ui__round-heading">
        <span className="game-ui__eyebrow">ROUND</span>
        <strong>{safeCurrent}</strong>
        <span>of {totalRounds}</span>
      </div>
      <ol>
        {Array.from({ length: totalRounds }, (_, index) => {
          const round = index + 1;
          return (
            <li
              key={round}
              className={classNames(
                round <= safeCompleted && 'is-complete',
                round === safeCurrent && 'is-current',
              )}
              aria-current={round === safeCurrent ? 'step' : undefined}
            >
              <span>{round}</span>
            </li>
          );
        })}
      </ol>
      <span className="game-ui__progress-copy">
        {safeCompleted} complete · {totalRounds - safeCompleted} remaining
      </span>
    </nav>
  );
}

export interface SourceLabelProps extends UiNamespaceProps {
  attribution?: EvidenceAttribution;
  sourceKind?: EvidenceAttribution['sourceKind'];
  coverage?: EvidenceCoverage;
  observedAt?: string;
  unavailable?: boolean;
  state?: GameUiState;
}

export function SourceLabel({
  attribution,
  sourceKind = attribution?.sourceKind ?? 'synthetic',
  coverage,
  observedAt,
  unavailable = false,
  state = 'default',
  namespace = 'daily-five',
  className,
}: SourceLabelProps) {
  const label =
    attribution?.label ??
    (sourceKind === 'synthetic'
      ? 'Synthetic fixture'
      : sourceKind === 'historical-snapshot'
        ? 'Historical snapshot'
        : 'Historical reconstruction');
  const status = unavailable
    ? 'Unavailable'
    : coverage?.status === 'partial'
      ? 'Partial coverage'
      : 'Available';
  const time = observedAt ?? coverage?.observedAt;
  return (
    <div
      className={uiRoot(
        namespace,
        classNames(
          'game-ui__source-label',
          stateClass(state),
          unavailable && 'is-unavailable',
          className,
        ),
      )}
    >
      <GameIcon name={unavailable ? 'alert' : 'search'} size={15} />
      <span className="game-ui__source-copy">
        <span>
          <strong>{label}</strong>
          <small>
            {sourceKind.replaceAll('-', ' ')} · {status}
          </small>
        </span>
        {time && <time dateTime={time}>Observed {new Date(time).toUTCString()}</time>}
      </span>
      {attribution?.url && !unavailable && (
        <a href={attribution.url} target="_blank" rel="noreferrer">
          Source <GameIcon name="arrow" size={13} />
        </a>
      )}
    </div>
  );
}

export interface OutcomeStripProps extends UiNamespaceProps {
  result: DailyTicketResult | null;
  state?: GameUiState;
  onContinue?: () => void;
}

export function OutcomeStrip({
  result,
  state = 'default',
  onContinue,
  namespace = 'daily-five',
  className,
}: OutcomeStripProps) {
  if (state === 'loading')
    return (
      <section
        className={uiRoot(namespace, classNames('game-ui__outcome-strip', 'is-loading', className))}
        aria-busy="true"
      >
        Evaluating ticket…
      </section>
    );
  if (!result || state === 'empty')
    return (
      <section
        className={uiRoot(namespace, classNames('game-ui__outcome-strip', 'is-empty', className))}
      >
        Submit a ticket to see its historical result.
      </section>
    );
  if (state === 'unavailable')
    return (
      <section
        className={uiRoot(
          namespace,
          classNames('game-ui__outcome-strip', 'is-unavailable', className),
        )}
        role="status"
      >
        This result is temporarily unavailable.
      </section>
    );
  const decision =
    result.decision.kind === 'cash'
      ? 'Cash held'
      : result.decision.kind === 'portfolio'
        ? 'Portfolio'
        : `${result.decision.side === 'long' ? 'Long' : 'Short'} · ${result.decision.leverage}×`;
  const positive = !result.returnPct.startsWith('-');
  return (
    <section
      className={uiRoot(
        namespace,
        classNames(
          'game-ui__outcome-strip',
          stateClass(state),
          result.liquidated && 'is-liquidated',
          className,
        ),
      )}
      aria-label={`Round ${result.roundIndex} outcome`}
    >
      <div className="game-ui__outcome-main">
        <span className="game-ui__eyebrow">ROUND {result.roundIndex} RESULT</span>
        <strong>{result.liquidated ? 'Liquidated at evaluated candle' : decision}</strong>
        <small>{result.explanation}</small>
      </div>
      <div className="game-ui__outcome-stat">
        <span>Ticket equity</span>
        <strong>{fixedDisplayMoney(result.endingEquity)}</strong>
      </div>
      <div
        className={classNames('game-ui__outcome-stat', positive ? 'is-positive' : 'is-negative')}
      >
        <span>Return</span>
        <strong>{result.returnPct}%</strong>
      </div>
      {onContinue && (
        <button type="button" className="game-ui__text-button" onClick={onContinue}>
          Continue <GameIcon name="arrow" size={14} />
        </button>
      )}
    </section>
  );
}

export { EVIDENCE_CATEGORY_LABELS, getSharedChartScale, normalizeToStartingIndex };
