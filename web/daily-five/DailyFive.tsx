import { useEffect, useMemo, useState } from 'react';
import type {
  DailyAttemptView,
  DailyFivePublic,
  DailyFiveTransport,
  DailyFinalResult,
  DailyRoundPublic,
  DailyTicketResult,
} from '../../shared/daily-five.js';
import type { RevealedClue, UnopenedClueDescriptor } from '../../shared/evidence.js';
import {
  DirectionToggle,
  GameIcon,
  PriceChart,
  EVIDENCE_CATEGORY_LABELS,
  fixedDisplayMoney,
  getSharedChartScale,
} from '../game-ui/index.js';
import {
  commandKey,
  createDailyFiveApi,
  withDailyDeadline,
  type DailyLeaderboard,
} from '../api/daily-five.js';
import {
  buildDailyFiveShareText,
  copyDailyFiveShareText,
  dailyDirectionAccuracy,
  dailyOutcomeSymbol,
  downloadDailyFiveScorecard,
  shareDailyFiveNative,
  type DailyFiveShareInput,
} from '../share/daily-five.js';
import { errorMessage, RequestProgress, useDailyFiveJourney } from './journey.js';
import '../daily-five.css';
import '../game-ui.css';

type DraftKind = 'trade' | 'cash';

interface DailyDraft {
  readonly kind: DraftKind;
  readonly assetId: string;
  readonly side: 'long' | 'short';
  readonly leverage: number;
}

export interface DailyFiveScreenProps {
  readonly transport?: DailyFiveTransport;
  readonly dailyNumber?: string | number;
  readonly onChallengeFriend?: (input: DailyFiveShareInput) => Promise<void> | void;
  readonly loadLeaderboard?: (dailyId: string) => Promise<DailyLeaderboard>;
  readonly storageKey?: string;
  readonly showLeaderboard?: boolean;
  readonly onPracticeAgain?: () => void;
}

const DEFAULT_TRANSPORT = createDailyFiveApi();
const LEVERAGE_PRESETS = [1, 5, 10, 25, 50, 100] as const;
const CLUE_QUESTIONS: Record<string, string> = {
  flow: 'Who is pressing harder: buyers or sellers?',
  crowd: 'Is participation spreading?',
  'whale-footprint': 'Is the activity concentrated?',
  volume: 'Does volume support this move?',
  volatility: 'How unstable has the path been?',
  absorption: 'Is pressure producing much price movement?',
};

function dailyNumberFromId(dailyId: string): string {
  const day = dailyId.match(/(\d{2})$/)?.[1];
  return day ? day.padStart(3, '0') : dailyId.replace(/^daily-/, '');
}

function displayQuestion(clue: UnopenedClueDescriptor): UnopenedClueDescriptor {
  return { ...clue, question: CLUE_QUESTIONS[clue.category] ?? clue.question };
}

function defaultDraft(round: DailyRoundPublic): DailyDraft {
  return {
    kind: 'trade',
    assetId: round.candidates[0]?.assetId ?? '',
    side: 'long',
    leverage: 1,
  };
}

function moneyNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function ticketMoney(value: string | number): string {
  return fixedDisplayMoney(Number(value)).replace(/\.00$/, '');
}

function compactAmountInput(value: number): string {
  const rounded = Math.max(0, Math.round(value));
  if (rounded >= 1000) {
    const thousands = rounded / 1000;
    return `${Number.isInteger(thousands) ? thousands : thousands.toFixed(1)}k`;
  }
  return `${rounded}`;
}

function parseCompactAmount(value: string): number {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[$,\s]/g, '');
  if (!normalized) return 0;
  const thousands = normalized.endsWith('k');
  const parsed = Number(thousands ? normalized.slice(0, -1) : normalized);
  if (!Number.isFinite(parsed)) return 0;
  return parsed * (thousands ? 1000 : 1);
}

function signedMoneyDelta(ending: string, starting: string): string {
  const delta = moneyNumber(ending) - moneyNumber(starting);
  return `${delta >= 0 ? '+' : '-'}${fixedDisplayMoney(Math.abs(delta))}`;
}

function calculateAccuracyLabel(result: DailyFinalResult): string {
  const accuracy = dailyDirectionAccuracy(result);
  return accuracy.total === 0
    ? 'No directional tickets'
    : `${accuracy.correct}/${accuracy.total} directions`;
}

function resultHeading(result: DailyTicketResult): string {
  if (result.liquidated) return 'The position reached its liquidation boundary.';
  if (result.decision.kind === 'cash') return 'Cash held through the historical window.';
  return result.returnPct.startsWith('-')
    ? 'The position lost value.'
    : 'The position gained value.';
}

function decisionLabel(result: DailyTicketResult): string {
  if (result.decision.kind === 'cash') return 'Cash ticket';
  if (result.decision.kind === 'portfolio') return 'Portfolio ticket';
  return `${result.decision.side === 'long' ? 'Long' : 'Short'} · ${result.decision.leverage}×`;
}

function signedPercent(value: string): string {
  return `${value.startsWith('-') ? '' : '+'}${value}%`;
}

function percentTone(value: string): 'is-negative' | 'is-positive' | '' {
  if (value.startsWith('-')) return 'is-negative';
  if (value === '0.00') return '';
  return 'is-positive';
}

function revealedAssetLabel(
  name: string | undefined,
  symbol: string | undefined,
  fallback: string,
): string {
  if (!name) return fallback;
  return symbol ? `${name} (${symbol})` : name;
}

function revealAsset(attempt: DailyAttemptView): string {
  const result = attempt.savedResult?.result;
  const decision = result?.decision;
  if (!decision || decision.kind === 'cash') return 'Cash ticket';
  if (decision.kind === 'portfolio') return 'Portfolio ticket';
  return (
    attempt.round?.candidates.find((asset) => asset.assetId === decision.assetId)?.attemptAlias ??
    'Completed mystery asset'
  );
}

function ShareActions({
  input,
  onStatus,
  onChallengeFriend,
}: {
  input: DailyFiveShareInput;
  onStatus: (message: string) => void;
  onChallengeFriend?: (input: DailyFiveShareInput) => Promise<void> | void;
}) {
  async function copy() {
    try {
      await copyDailyFiveShareText(input);
      onStatus('Share text copied.');
    } catch (error) {
      onStatus(errorMessage(error));
    }
  }

  async function download() {
    try {
      await downloadDailyFiveScorecard(input);
      onStatus('PNG scorecard downloaded.');
    } catch (error) {
      onStatus(errorMessage(error));
    }
  }

  async function challenge() {
    try {
      if (onChallengeFriend) {
        await onChallengeFriend(input);
        onStatus('Comparable variant challenge ready to share.');
        return;
      }
      if (await shareDailyFiveNative(input)) {
        onStatus('Challenge opened in the native share sheet.');
        return;
      }
      await copyDailyFiveShareText(input);
      onStatus('Challenge text copied.');
    } catch (error) {
      onStatus(errorMessage(error));
    }
  }

  return (
    <div className="daily-five__share-actions" aria-label="Share Daily Five result">
      <button
        type="button"
        className="daily-five__button daily-five__button--primary"
        onClick={() => void copy()}
      >
        <GameIcon name="pin" size={16} /> Copy share text
      </button>
      <button type="button" className="daily-five__button" onClick={() => void download()}>
        Download PNG
      </button>
      <button type="button" className="daily-five__button" onClick={() => void challenge()}>
        Challenge a friend
      </button>
    </div>
  );
}

export function DailyFiveReveal({
  attempt,
  onContinue,
  busy = false,
}: {
  attempt: DailyAttemptView;
  onContinue: () => void;
  busy?: boolean;
}) {
  const saved = attempt.savedResult;
  if (!saved || !attempt.round) return null;
  const result = saved.result;
  const decision = result.decision;
  const asset =
    decision.kind === 'trade'
      ? attempt.round.candidates.find((candidate) => candidate.assetId === decision.assetId)
      : undefined;
  const portfolio = decision.kind === 'portfolio' ? (result.contributions ?? []) : [];
  return (
    <section className="daily-five__reveal" aria-live="polite" data-testid="daily-five-reveal">
      <div className="daily-five__reveal-heading">
        <div>
          <span className="daily-five__eyebrow">
            ROUND {result.roundIndex} · SAVED HISTORICAL RESULT
          </span>
          <h2 id="daily-five-title" tabIndex={-1}>
            {resultHeading(result)}
          </h2>
          <p>
            {decisionLabel(result)} ·{' '}
            {revealedAssetLabel(
              result.assetName,
              result.assetSymbol,
              asset?.attemptAlias ?? 'Cash held',
            )}
          </p>
        </div>
        <div
          className={`daily-five__reveal-equity ${result.returnPct.startsWith('-') ? 'is-negative' : 'is-positive'}`}
        >
          <span>TICKET EQUITY</span>
          <strong>{fixedDisplayMoney(result.endingEquity)}</strong>
          <small>{result.returnPct}%</small>
        </div>
      </div>
      <div className="daily-five__reveal-grid">
        <article className="daily-five__reveal-card">
          <span className="daily-five__eyebrow">EARLIER EVIDENCE</span>
          <h3>What was visible before the cutoff</h3>
          {asset ? (
            <PriceChart
              preDecision={asset.chart}
              cutoffAt={attempt.round.cutoffAt}
              label={`${asset.attemptAlias} earlier evidence`}
              accent="var(--daily-accent)"
            />
          ) : (
            <p>Cash stayed outside the directional evidence window.</p>
          )}
          <p className="daily-five__muted">
            Earlier clues described bounded evidence. They did not guarantee this result.
          </p>
        </article>
        <article className="daily-five__reveal-card">
          <span className="daily-five__eyebrow">LATER OUTCOME</span>
          <h3>The board has answered</h3>
          <dl className="daily-five__price-facts">
            <div>
              <dt>Entry</dt>
              <dd>
                {result.entryPrice ? fixedDisplayMoney(moneyNumber(result.entryPrice)) : 'Cash'}
              </dd>
            </div>
            <div>
              <dt>Exit or evaluated price</dt>
              <dd>
                {result.exitPrice
                  ? fixedDisplayMoney(moneyNumber(result.exitPrice))
                  : 'Not applicable'}
              </dd>
            </div>
            <div>
              <dt>Ticket outcome</dt>
              <dd>
                {result.liquidated
                  ? 'Liquidated'
                  : result.returnPct.startsWith('-')
                    ? 'Loss'
                    : 'Profit'}
              </dd>
            </div>
          </dl>
          <p className="daily-five__muted">
            The numerical result is saved before this view renders. Any optional motion is
            decorative and can be skipped.
          </p>
        </article>
        {decision.kind === 'portfolio' && (
          <article className="daily-five__reveal-card daily-five__reveal-card--portfolio">
            <span className="daily-five__eyebrow">PORTFOLIO OUTCOME</span>
            <h3>See what each allocation did</h3>
            <div className="daily-five__portfolio-outcomes">
              {portfolio.map((contribution) => {
                const contributionAsset = attempt.round?.candidates.find(
                  (candidate) => candidate.assetId === contribution.assetId,
                );
                const outcomeScale = contribution.outcomeChart
                  ? getSharedChartScale([
                      contributionAsset?.chart.map((point) => point.value) ?? [],
                      contribution.outcomeChart.map((point) => point.value),
                    ])
                  : undefined;
                return (
                  <div className="daily-five__portfolio-outcome" key={contribution.assetId}>
                    <div className="daily-five__portfolio-outcome-heading">
                      <strong>
                        {revealedAssetLabel(
                          contribution.assetName,
                          contribution.assetSymbol,
                          contributionAsset?.attemptAlias ?? 'Mystery asset',
                        )}
                      </strong>
                      <span>
                        {contribution.weightBps / 100}% · {contribution.leverage ?? 1}×
                      </span>
                    </div>
                    {contributionAsset && contribution.outcomeChart ? (
                      <PriceChart
                        preDecision={contributionAsset.chart}
                        revealed={contribution.outcomeChart}
                        cutoffAt={attempt.round?.cutoffAt ?? ''}
                        scale={outcomeScale}
                        label={`${revealedAssetLabel(contribution.assetName, contribution.assetSymbol, contributionAsset.attemptAlias)} portfolio outcome`}
                        accent="var(--daily-accent)"
                      />
                    ) : null}
                    <dl>
                      <div>
                        <dt>Ending equity</dt>
                        <dd>{fixedDisplayMoney(contribution.endingEquity)}</dd>
                      </div>
                      <div>
                        <dt>Return</dt>
                        <dd
                          className={
                            contribution.returnPct.startsWith('-') ? 'is-negative' : 'is-positive'
                          }
                        >
                          {contribution.returnPct}%
                        </dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>{contribution.liquidated ? 'Liquidated' : 'Settled'}</dd>
                      </div>
                    </dl>
                  </div>
                );
              })}
              <div className="daily-five__portfolio-cash-outcome">
                <span>Net profit/loss</span>
                <strong>{signedMoneyDelta(result.endingEquity, result.stake)}</strong>
              </div>
            </div>
          </article>
        )}
        <article className="daily-five__reveal-card daily-five__reveal-card--why">
          <span className="daily-five__eyebrow">WHY THIS RESULT</span>
          <h3>
            {result.liquidated
              ? 'The adverse extreme exhausted the ticket.'
              : 'The historical window settled the ticket.'}
          </h3>
          <p>{result.explanation}</p>
          <p className="daily-five__muted">
            This explains the saved historical outcome; it does not turn the earlier signal into a
            promise.
          </p>
        </article>
      </div>
      <button
        type="button"
        className="daily-five__button daily-five__button--primary daily-five__next"
        onClick={onContinue}
        disabled={busy}
      >
        {busy
          ? 'Checking saved progress…'
          : result.roundIndex === (attempt.rules?.totalRounds ?? 5)
            ? 'See final score'
            : 'Next trade'}{' '}
        <GameIcon name="arrow" size={17} />
      </button>
    </section>
  );
}

/** Cumulative v2 reveal: one outcome row per selected asset, with the chart and explanation kept together. */
export function DailyFivePortfolioReveal({
  attempt,
  onContinue,
  busy = false,
}: {
  attempt: DailyAttemptView;
  onContinue: () => void;
  busy?: boolean;
}) {
  const saved = attempt.savedResult;
  const round = attempt.round;
  if (!saved) return null;
  const result = saved.result;
  const contributions = result.contributions ?? [];
  const candidates = round?.candidates ?? [];
  const openedClues = candidates.flatMap((asset) =>
    asset.unlockedClues.map((clue) => ({ clue, assetLabel: asset.attemptAlias })),
  );
  const walletExhausted = moneyNumber(result.endingEquity) <= 0;
  return (
    <section
      className="daily-five__portfolio-reveal"
      aria-live="polite"
      data-testid="daily-five-portfolio-reveal"
    >
      <header className="daily-five__reveal-heading">
        <div>
          <span className="daily-five__eyebrow">
            ROUND {result.roundIndex} · PORTFOLIO REVEALED
          </span>
          <h2 id="daily-five-title" tabIndex={-1}>
            The wallet moved with the market.
          </h2>
          <p>Locked allocations are settled against the published outcome window for this case.</p>
        </div>
        <div className={`daily-five__reveal-equity ${percentTone(result.returnPct)}`}>
          <span>ENDING WALLET</span>
          <strong>{fixedDisplayMoney(result.endingEquity)}</strong>
          <small className={percentTone(result.returnPct)}>
            {signedPercent(result.returnPct)} this round
          </small>
        </div>
      </header>

      <div className="daily-five__wallet-summary" aria-label="Wallet movement">
        <div>
          <span>Wallet before lock</span>
          <strong>{fixedDisplayMoney(result.stake)}</strong>
        </div>
        <div>
          <span>Wallet after settlement</span>
          <strong className={percentTone(result.returnPct)}>
            {fixedDisplayMoney(result.endingEquity)}
          </strong>
        </div>
        <div>
          <span>Net profit/loss</span>
          <strong>{signedMoneyDelta(result.endingEquity, result.stake)}</strong>
        </div>
      </div>

      <div className="daily-five__portfolio-reveal-list">
        {contributions.length === 0 ? (
          <article className="daily-five__portfolio-outcome-row">
            <div className="daily-five__portfolio-outcome-chart">
              <span className="daily-five__eyebrow">MARKET CHART</span>
              <h3>No market exposure</h3>
              <p className="daily-five__muted">
                Cash stayed outside the directional evidence window, so there is no asset path to
                chart.
              </p>
            </div>
            <div className="daily-five__portfolio-outcome-copy daily-five__portfolio-outcome-result">
              <span className="daily-five__eyebrow">ROUND RESULT</span>
              <h3>100% cash</h3>
              <p className="daily-five__portfolio-outcome-status">Wallet preserved.</p>
              <dl className="daily-five__outcome-facts">
                <div>
                  <dt>Net profit/loss</dt>
                  <dd>{signedMoneyDelta(result.endingEquity, result.stake)}</dd>
                </div>
                <div>
                  <dt>Round return</dt>
                  <dd className={percentTone(result.returnPct)}>
                    {signedPercent(result.returnPct)}
                  </dd>
                </div>
              </dl>
            </div>
          </article>
        ) : (
          contributions.map((contribution) => {
            const asset = candidates.find((item) => item.assetId === contribution.assetId);
            const outcomeScale =
              asset && contribution.outcomeChart
                ? getSharedChartScale(
                    [
                      asset.chart.map((point) => point.value),
                      contribution.outcomeChart.map((point) => point.value),
                    ],
                    0.15,
                  )
                : undefined;
            const assetMove =
              contribution.entryPrice && contribution.exitPrice
                ? (
                    (moneyNumber(contribution.exitPrice) / moneyNumber(contribution.entryPrice) -
                      1) *
                    100
                  ).toFixed(2)
                : '0.00';
            return (
              <article className="daily-five__portfolio-outcome-row" key={contribution.assetId}>
                <div className="daily-five__portfolio-outcome-chart">
                  {asset && contribution.outcomeChart ? (
                    <PriceChart
                      preDecision={asset.chart}
                      revealed={contribution.outcomeChart}
                      cutoffAt={round?.cutoffAt ?? ''}
                      scale={outcomeScale}
                      label={`${revealedAssetLabel(contribution.assetName, contribution.assetSymbol, asset?.attemptAlias ?? 'Asset')} portfolio outcome`}
                      accent="var(--daily-accent)"
                    />
                  ) : (
                    <p className="daily-five__muted">Outcome chart unavailable.</p>
                  )}
                </div>
                <div className="daily-five__portfolio-outcome-copy daily-five__portfolio-outcome-result">
                  <span className="daily-five__eyebrow">REAL ASSET</span>
                  <h3>
                    {revealedAssetLabel(
                      contribution.assetName,
                      contribution.assetSymbol,
                      asset?.attemptAlias ?? 'Mystery asset',
                    )}
                  </h3>
                  <p className="daily-five__portfolio-outcome-status">
                    {contribution.liquidated ? 'Position liquidated.' : 'Position settled.'}
                  </p>
                  <p>
                    {contribution.weightBps / 100}% allocation · {contribution.leverage ?? 1}×
                    leverage. The underlying asset moved{' '}
                    {signedPercent(contribution.assetReturnPct ?? assetMove)} from entry to exit.
                    Your leveraged position returned{' '}
                    <strong
                      className={percentTone(
                        contribution.leveragedReturnPct ?? contribution.returnPct,
                      )}
                    >
                      {signedPercent(contribution.leveragedReturnPct ?? contribution.returnPct)}
                    </strong>{' '}
                    after costs.
                  </p>
                  <dl className="daily-five__outcome-facts">
                    <div>
                      <dt>Entry</dt>
                      <dd>
                        {contribution.entryPrice ? formatAssetPrice(contribution.entryPrice) : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>Exit</dt>
                      <dd>
                        {contribution.exitPrice ? formatAssetPrice(contribution.exitPrice) : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt>Asset return</dt>
                      <dd className={percentTone(contribution.assetReturnPct ?? assetMove)}>
                        {signedPercent(contribution.assetReturnPct ?? assetMove)}
                      </dd>
                    </div>
                    <div>
                      <dt>Your leveraged return</dt>
                      <dd
                        className={percentTone(
                          contribution.leveragedReturnPct ?? contribution.returnPct,
                        )}
                      >
                        {fixedDisplayMoney(contribution.endingEquity)} ·{' '}
                        {signedPercent(contribution.leveragedReturnPct ?? contribution.returnPct)}
                      </dd>
                    </div>
                  </dl>
                </div>
              </article>
            );
          })
        )}
      </div>
      <section className="daily-five__portfolio-outcome-evidence">
        <span className="daily-five__eyebrow">WHY THIS RESULT</span>
        <h3>
          {contributions.length === 0
            ? 'The opened clues did not require a market position.'
            : 'What the opened clues could tell you'}
        </h3>
        <div className="daily-five__clue-readout">
          <span className="daily-five__eyebrow">ALL OPENED CLUES · {openedClues.length}/3</span>
          <ClueSlots clues={openedClues} />
          <p className="daily-five__muted">
            Each card is labeled with the asset whose clue was opened. The clue can describe a
            different asset from the position shown above, and it is evidence—not a guarantee.
          </p>
        </div>
        <p>{result.explanation}</p>
      </section>

      <button
        type="button"
        className="daily-five__button daily-five__button--primary daily-five__next"
        onClick={onContinue}
        disabled={busy}
      >
        {busy
          ? 'Saving your progress…'
          : walletExhausted || result.roundIndex === (attempt.rules?.totalRounds ?? 5)
            ? 'See final score'
            : 'Continue to next round'}{' '}
        <GameIcon name="arrow" size={17} />
      </button>
    </section>
  );
}

export function DailyFiveFinal({
  daily,
  attempt,
  mode,
  dailyNumber,
  onStatus,
  onChallengeFriend,
  leaderboard,
  showLeaderboard = true,
  onPracticeAgain,
}: {
  daily: DailyFivePublic;
  attempt: DailyAttemptView;
  mode: 'official' | 'practice';
  dailyNumber?: string | number;
  onStatus: (message: string) => void;
  onChallengeFriend?: (input: DailyFiveShareInput) => Promise<void> | void;
  leaderboard?: DailyLeaderboard | null;
  showLeaderboard?: boolean;
  onPracticeAgain?: () => void;
}) {
  const result = attempt.finalResult;
  if (!result) return null;
  const endedEarly = result.endedEarly === true;
  const input: DailyFiveShareInput = {
    dailyNumber: dailyNumber ?? dailyNumberFromId(daily.dailyId),
    result,
    mode,
  };
  const sharePreview = buildDailyFiveShareText(input);
  return (
    <section className="daily-five__final" aria-live="polite" data-testid="daily-five-final">
      <div className="daily-five__final-heading">
        <div>
          <span className="daily-five__eyebrow">
            {endedEarly ? 'DAILY FIVE ENDED · NO FUNDS' : 'DAILY FIVE COMPLETE'} ·{' '}
            {mode === 'practice' ? 'PRACTICE VARIANT' : 'OFFICIAL ATTEMPT'}
          </span>
          <h2 id="daily-five-title" tabIndex={-1}>
            {endedEarly ? 'The wallet reached zero.' : 'Five decisions, one saved score.'}
          </h2>
          <p>
            {endedEarly
              ? `The run ended after round ${result.tickets.at(-1)?.roundIndex ?? 0}; there was no wallet left for another round.`
              : mode === 'practice'
                ? 'One round complete. Your practice result is ready.'
                : 'Five rounds complete. Your cumulative wallet is ready to share.'}
          </p>
        </div>
        <div
          className={`daily-five__final-equity daily-five__final-score ${result.returnPct.startsWith('-') ? 'is-negative' : 'is-positive'}`}
          data-testid="daily-five-final-score"
        >
          <span>FINAL SCORE · WALLET</span>
          <strong>{fixedDisplayMoney(result.totalEquity)}</strong>
          <small className={percentTone(result.returnPct)}>
            {signedPercent(result.returnPct)} total return
          </small>
        </div>
      </div>
      <div className="daily-five__final-grid">
        <article className="daily-five__final-card daily-five__final-card--score">
          <span className="daily-five__eyebrow">OUTCOME STRIP</span>
          <div
            className="daily-five__outcome-symbols"
            aria-label={`${result.tickets.length} saved round outcomes`}
          >
            {result.tickets.map((ticket) => (
              <span
                key={ticket.roundIndex}
                className={percentTone(ticket.returnPct)}
                title={`Round ${ticket.roundIndex}: ${signedPercent(ticket.returnPct)}`}
              >
                <small>R{ticket.roundIndex}</small>
                <strong>{signedPercent(ticket.returnPct)}</strong>
                <i aria-hidden="true">{dailyOutcomeSymbol(ticket)}</i>
              </span>
            ))}
          </div>
          <dl className="daily-five__score-facts">
            <div>
              <dt>Starting wallet</dt>
              <dd>{fixedDisplayMoney(result.tickets[0]?.stake ?? '10000.00')}</dd>
            </div>
            <div>
              <dt>Profitable rounds</dt>
              <dd>
                {
                  result.tickets.filter(
                    (ticket) => !ticket.returnPct.startsWith('-') && ticket.returnPct !== '0.00',
                  ).length
                }
                /{result.tickets.length}
              </dd>
            </div>
            <div>
              <dt>Liquidations</dt>
              <dd>{result.tickets.filter((ticket) => ticket.liquidated).length}</dd>
            </div>
          </dl>
        </article>
        {showLeaderboard ? (
          <article className="daily-five__final-card daily-five__final-card--leaderboard">
            <span className="daily-five__eyebrow">LEADERBOARD</span>
            <h3>Who read the board best?</h3>
            {leaderboard?.entries.length ? (
              <div
                className="daily-five__leaderboard"
                role="table"
                aria-label="Daily Five leaderboard"
              >
                {leaderboard.entries.slice(0, 10).map((entry) => (
                  <div className="daily-five__leaderboard-row" role="row" key={entry.attemptId}>
                    <strong role="cell">#{entry.rank}</strong>
                    <span role="cell">{entry.name ?? entry.attemptId.slice(0, 8)}</span>
                    <b role="cell">{fixedDisplayMoney(entry.equity)}</b>
                    <em role="cell" className={percentTone(entry.returnPct)}>
                      {signedPercent(entry.returnPct)}
                    </em>
                  </div>
                ))}
              </div>
            ) : (
              <p className="daily-five__muted">
                Leaderboard entries will appear after official scores are posted.
              </p>
            )}
          </article>
        ) : (
          <article className="daily-five__final-card daily-five__final-card--leaderboard">
            <span className="daily-five__eyebrow">PRACTICE ARENA</span>
            <h3>Take another shot.</h3>
            <p className="daily-five__muted">
              Practice is one round on a fresh five-asset board. Sharpen your read without touching
              the official leaderboard.
            </p>
            {onPracticeAgain && (
              <button
                type="button"
                className="daily-five__button daily-five__button--primary"
                onClick={onPracticeAgain}
              >
                Draw five new assets
              </button>
            )}
          </article>
        )}
      </div>
      <ShareActions input={input} onStatus={onStatus} onChallengeFriend={onChallengeFriend} />
      <details className="daily-five__share-preview">
        <summary>Preview safe share text</summary>
        <pre>{sharePreview}</pre>
      </details>
      <p className="daily-five__final-note">
        {mode === 'official'
          ? 'Five rounds complete. Your read is on the board — share the score, challenge a friend, and come back for the next signal. Shares include wallet movement and round percentages, never private token identities or provider mappings.'
          : 'Practice results are private to your account and are never posted to the daily or all-time leaderboards.'}
      </p>
    </section>
  );
}

/** Renders the five-round journey using only public evidence and saved server results. */
export function DailyFiveScreen({
  transport = DEFAULT_TRANSPORT,
  dailyNumber,
  onChallengeFriend,
  loadLeaderboard,
  storageKey,
  showLeaderboard = true,
  onPracticeAgain,
}: DailyFiveScreenProps) {
  const journey = useDailyFiveJourney(transport, storageKey);
  const {
    daily,
    attempt,
    mode,
    loading,
    busy,
    error,
    status,
    setStatus,
    operation,
    reconnect,
    startFresh,
    missing,
    needsReconnect,
    act,
  } = journey;
  const [drafts, setDrafts] = useState<Record<number, DailyDraft>>({});
  const [selectedClues, setSelectedClues] = useState<Record<string, string>>({});
  const [leaderboard, setLeaderboard] = useState<DailyLeaderboard | null>(null);
  useEffect(() => {
    setDrafts({});
    setSelectedClues({});
  }, [attempt?.attemptId]);
  useEffect(() => {
    document.getElementById('daily-five-title')?.focus();
  }, [attempt?.attemptId, attempt?.phase, attempt?.currentRoundIndex]);
  useEffect(() => {
    let cancelled = false;
    if (loadLeaderboard && daily && attempt?.finalResult) {
      void withDailyDeadline(() => loadLeaderboard(daily.dailyId))
        .then((value) => {
          if (!cancelled) setLeaderboard(value);
        })
        .catch(() => {
          if (!cancelled) setLeaderboard(null);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [attempt?.finalResult, daily, loadLeaderboard]);

  const round = attempt?.round ?? null;
  const candidates = useMemo(
    () =>
      [...(round?.candidates ?? [])].sort((a, b) =>
        a.attemptAlias.localeCompare(b.attemptAlias, 'en', { numeric: true }),
      ),
    [round],
  );
  const currentDraft = round
    ? (drafts[round.roundIndex] ?? defaultDraft({ ...round, candidates }))
    : null;
  const selectedAsset =
    candidates.find((candidate) => candidate.assetId === currentDraft?.assetId) ?? candidates[0];
  const controlsDisabled = busy || needsReconnect;

  function updateDraft(patch: Partial<DailyDraft>) {
    if (!round || !currentDraft || controlsDisabled) return;
    setDrafts((current) => ({ ...current, [round.roundIndex]: { ...currentDraft, ...patch } }));
  }
  async function unlock(clue: UnopenedClueDescriptor) {
    if (!attempt || !round || !selectedAsset || controlsDisabled) return;
    const assetId = selectedAsset.assetId;
    const updated = await act('Unlocking evidence', () =>
      transport.unlock(attempt.attemptId, {
        kind: 'unlock-clue',
        roundIndex: round.roundIndex,
        assetId,
        clueId: clue.clueId,
        expectedStateVersion: attempt.stateVersion,
        idempotencyKey: commandKey(`clue-${round.roundIndex}-${clue.clueId}`),
      }),
    );
    if (
      updated?.round?.candidates
        .find((asset) => asset.assetId === assetId)
        ?.unlockedClues.some((answer) => answer.clueId === clue.clueId)
    ) {
      setSelectedClues((current) => ({ ...current, [assetId]: clue.clueId }));
    }
  }
  async function submit() {
    if (!attempt || !round || !currentDraft || controlsDisabled) return;
    if (
      currentDraft.kind === 'trade' &&
      (!Number.isInteger(currentDraft.leverage) ||
        currentDraft.leverage < 1 ||
        currentDraft.leverage > 100)
    )
      return;
    const meta = {
      roundIndex: round.roundIndex,
      expectedStateVersion: attempt.stateVersion,
      idempotencyKey: commandKey(`ticket-${round.roundIndex}`),
    };
    await act('Saving your ticket', () =>
      transport.submit(
        attempt.attemptId,
        currentDraft.kind === 'cash'
          ? { ...meta, kind: 'cash' }
          : {
              ...meta,
              kind: 'trade',
              assetId: currentDraft.assetId,
              side: currentDraft.side,
              leverage: currentDraft.leverage,
            },
      ),
    );
  }
  async function continueRound() {
    if (
      !attempt ||
      attempt.phase !== 'saved-result' ||
      attempt.currentRoundIndex === null ||
      controlsDisabled
    )
      return;
    const roundIndex = attempt.currentRoundIndex;
    await act(
      roundIndex === (attempt.rules?.totalRounds ?? 5)
        ? 'Opening your final score'
        : 'Opening the next round',
      () =>
        transport.continue(attempt.attemptId, {
          kind: 'continue',
          roundIndex,
          expectedStateVersion: attempt.stateVersion,
          idempotencyKey: commandKey(`continue-${roundIndex}`),
        }),
    );
  }
  const feedback = (
    <div className="daily-five__feedback">
      <RequestProgress operation={operation} />
      {error && !status && (needsReconnect || !attempt) && (
        <div className="daily-five__status is-error" role="alert">
          <span>{error}</span>
          <button className="daily-five__button" type="button" disabled={busy} onClick={reconnect}>
            Try again
          </button>
          {missing && (
            <button
              className="daily-five__button"
              type="button"
              disabled={busy}
              onClick={startFresh}
            >
              Open a new attempt
            </button>
          )}
          {missing && (
            <small>
              Your previous score stays saved. If an official attempt already exists, the new
              attempt is practice.
            </small>
          )}
        </div>
      )}
      {status && (
        <p className="daily-five__status" role="status">
          {status}
        </p>
      )}
    </div>
  );

  if (loading && !attempt)
    return (
      <section className="daily-five game-ui daily-five__state" aria-live="polite" aria-busy="true">
        <GameIcon name="pulse" size={24} />
        <h1>{operation?.label ?? 'Reading today’s current'}…</h1>
        <p>Loading the saved historical case. Your progress is kept on the server.</p>
        <RequestProgress operation={operation} />
      </section>
    );
  if (!daily || !attempt || (missing && needsReconnect))
    return (
      <section className="daily-five game-ui daily-five__state">
        <GameIcon name="alert" size={24} />
        <h1>{missing ? 'Let’s reopen today’s Daily Five.' : 'Daily Five could not connect.'}</h1>
        <p>Try again to reload your saved progress.</p>
        {feedback}
      </section>
    );

  const complete = attempt.finalResult
    ? attempt.finalResult.tickets.length
    : attempt.phase === 'saved-result'
      ? (attempt.currentRoundIndex ?? 0)
      : Math.max(0, (attempt.currentRoundIndex ?? 1) - 1);
  const effectiveDaily = attempt.rules ? { ...daily, rules: attempt.rules } : daily;
  if (attempt.phase === 'final-result')
    return (
      <main className="daily-five game-ui" aria-labelledby="daily-five-title">
        {feedback}
        <DailyProgress
          complete={complete}
          current={null}
          totalRounds={effectiveDaily.rules.totalRounds}
          ended={attempt.finalResult?.endedEarly === true}
        />
        <DailyFiveFinal
          daily={effectiveDaily}
          attempt={attempt}
          mode={mode}
          dailyNumber={dailyNumber}
          onStatus={setStatus}
          onChallengeFriend={onChallengeFriend}
          leaderboard={leaderboard}
          showLeaderboard={showLeaderboard}
          onPracticeAgain={onPracticeAgain}
        />
      </main>
    );
  if (attempt.phase === 'saved-result')
    return (
      <main className="daily-five game-ui" aria-labelledby="daily-five-title">
        {feedback}
        <DailyProgress
          complete={complete}
          current={null}
          totalRounds={effectiveDaily.rules.totalRounds}
        />
        {effectiveDaily.rules.version === 'daily-five-v2' ? (
          <DailyFivePortfolioReveal
            attempt={attempt}
            onContinue={() => void continueRound()}
            busy={controlsDisabled}
          />
        ) : (
          <DailyFiveReveal
            attempt={attempt}
            onContinue={() => void continueRound()}
            busy={controlsDisabled}
          />
        )}
      </main>
    );
  if (effectiveDaily.rules.version === 'daily-five-v2')
    return (
      <main className="daily-five game-ui" aria-labelledby="daily-five-title">
        {feedback}
        <DailyProgress
          complete={complete}
          current={attempt.currentRoundIndex}
          totalRounds={effectiveDaily.rules.totalRounds}
        />
        <DailyFivePortfolioExperience
          daily={effectiveDaily}
          attempt={attempt}
          mode={mode}
          busy={controlsDisabled}
          transport={transport}
          act={act}
          onStatus={setStatus}
          dailyNumber={dailyNumber}
          onChallengeFriend={onChallengeFriend}
          showLeaderboard={showLeaderboard}
          onPracticeAgain={onPracticeAgain}
        />
      </main>
    );
  if (!round || !currentDraft || !selectedAsset)
    return (
      <section className="daily-five game-ui daily-five__state">
        <h1>Today’s Daily Five is loading.</h1>
        <p>The current market case is not ready to display yet.</p>
        {feedback}
        <button
          className="daily-five__button daily-five__button--primary"
          type="button"
          onClick={reconnect}
        >
          Try again
        </button>
      </section>
    );

  const selectedClueId =
    selectedClues[selectedAsset.assetId] ?? selectedAsset.unlockedClues[0]?.clueId;
  const selectedClue = selectedAsset.unlockedClues.find((clue) => clue.clueId === selectedClueId);
  const stake = moneyNumber(effectiveDaily.rules.roundStake);
  const stakeLabel = ticketMoney(stake);
  const remaining = moneyNumber(effectiveDaily.rules.startingCapital) - complete * stake;
  const validLeverage =
    Number.isInteger(currentDraft.leverage) &&
    currentDraft.leverage >= 1 &&
    currentDraft.leverage <= 100;
  const cash = currentDraft.kind === 'cash';
  const exposure = cash ? 0 : validLeverage ? stake * currentDraft.leverage : null;

  return (
    <main className="daily-five game-ui" aria-labelledby="daily-five-title">
      <header className="daily-five__header">
        <div>
          <span className="daily-five__eyebrow">
            DAILY FIVE · {mode === 'official' ? 'OFFICIAL ATTEMPT' : 'PRACTICE'} ·{' '}
            {round.evidence.sourceKind === 'synthetic' ? 'SYNTHETIC REPLAY' : 'HISTORICAL REPLAY'}
          </span>
          <h1 id="daily-five-title" tabIndex={-1}>
            Find your edge.
          </h1>
          <p>Spot the signal. Open the clues. Make your call—or hold cash.</p>
        </div>
        <div className="daily-five__bank">
          <span>VIRTUAL CAPITAL</span>
          <strong>{ticketMoney(remaining)} remaining</strong>
          <small>
            {ticketMoney(effectiveDaily.rules.startingCapital)} max · {stakeLabel} per round
          </small>
        </div>
      </header>
      <DailyProgress complete={complete} current={round.roundIndex} />
      {feedback}
      <section
        className="daily-five__candidates"
        aria-label={`Five mystery assets for round ${round.roundIndex}`}
      >
        {candidates.map((asset) => (
          <button
            key={asset.assetId}
            type="button"
            className={`daily-five__asset ${asset.assetId === selectedAsset.assetId ? 'is-selected' : ''}`}
            aria-label={`Select ${asset.attemptAlias}`}
            aria-pressed={asset.assetId === selectedAsset.assetId}
            aria-controls="daily-five-selected-chart"
            disabled={controlsDisabled}
            onClick={() => updateDraft({ assetId: asset.assetId })}
          >
            <span className="daily-five__asset-name">
              <span className="daily-five__asset-letter">
                {asset.attemptAlias.split(' ').at(-1)}
              </span>
              <span className="daily-five__asset-full">{asset.attemptAlias}</span>
            </span>
            <span className="daily-five__mini-chart" aria-hidden="true">
              <PriceChart preDecision={asset.chart} />
            </span>
            <span className="daily-five__asset-state">
              {asset.assetId === selectedAsset.assetId ? 'Selected' : 'Inspect'}
            </span>
          </button>
        ))}
      </section>
      <div className="daily-five__workbench">
        <div className="daily-five__research">
          <section
            className="daily-five__selected-chart"
            id="daily-five-selected-chart"
            aria-label={`${selectedAsset.attemptAlias} selected chart`}
          >
            <div className="daily-five__section-heading">
              <div>
                <span className="daily-five__eyebrow">1 · INSPECT YOUR ASSET</span>
                <h2>
                  {selectedAsset.attemptAlias}{' '}
                  <span className="daily-five__selected-badge">Selected</span>
                </h2>
              </div>
              <span className="daily-five__muted">Each asset uses its own % scale</span>
            </div>
            <PriceChart
              preDecision={selectedAsset.chart}
              label={`${selectedAsset.attemptAlias} selected pre-decision chart`}
              accent="var(--daily-accent)"
            />
            <p className="daily-five__window">
              Evidence window: {evidenceWindow(selectedAsset.chart[0]?.at, round.cutoffAt)} · ends
              before the decision.
            </p>
          </section>
          <section className="daily-five__evidence" aria-labelledby="daily-five-evidence-title">
            <div className="daily-five__section-heading">
              <div>
                <span className="daily-five__eyebrow">2 · FOLLOW THE EVIDENCE</span>
                <h2 id="daily-five-evidence-title">What’s behind the move?</h2>
              </div>
              <span className="daily-five__ticket-chip">
                {round.unlocksRemaining} of 3 clues left
              </span>
            </div>
            <p className="daily-five__muted">
              Credits are shared across all five assets in this round. Opening an unlocked clue is
              free.
            </p>
            <div className="daily-five__clues">
              {selectedAsset.clueDescriptors.map((descriptor) => {
                const clue = displayQuestion(descriptor);
                const revealed = selectedAsset.unlockedClues.some(
                  (answer) => answer.clueId === clue.clueId,
                );
                const selected = revealed && selectedClueId === clue.clueId;
                return (
                  <button
                    type="button"
                    key={clue.clueId}
                    className={`daily-five__clue ${selected ? 'is-selected' : ''}`}
                    aria-pressed={selected}
                    aria-controls="daily-five-clue-answer"
                    aria-label={`${revealed ? 'Open' : 'Unlock'} ${EVIDENCE_CATEGORY_LABELS[clue.category]} clue`}
                    disabled={
                      controlsDisabled ||
                      round.evidence.status === 'unavailable' ||
                      (!revealed && round.unlocksRemaining === 0)
                    }
                    onClick={() =>
                      revealed
                        ? setSelectedClues((current) => ({
                            ...current,
                            [selectedAsset.assetId]: clue.clueId,
                          }))
                        : void unlock(clue)
                    }
                  >
                    <strong>{EVIDENCE_CATEGORY_LABELS[clue.category]}</strong>
                    <span>{clue.question}</span>
                    <small>
                      {selected
                        ? '✓ Selected'
                        : revealed
                          ? 'Unlocked · open'
                          : round.unlocksRemaining
                            ? 'Unlock · 1 credit'
                            : 'No credits left'}
                    </small>
                  </button>
                );
              })}
            </div>
            <div id="daily-five-clue-answer">
              {selectedClue ? (
                <ClueAnswer clue={selectedClue} />
              ) : (
                <p className="daily-five__clue-hint">
                  Choose a clue to reveal measured activity and what it could mean. You can also
                  trade using the chart alone.
                </p>
              )}
            </div>
            <p className="daily-five__muted">
              {round.evidence.sourceKind === 'synthetic'
                ? 'Fictional trades and wallets. No live market data.'
                : selectedAsset.coverage.description}{' '}
              Earlier signals never guarantee the outcome.
            </p>
            {round.evidence.status === 'unavailable' && (
              <p role="alert">
                {round.evidence.message ?? 'Evidence is unavailable for this window.'}{' '}
                <button
                  type="button"
                  className="daily-five__button"
                  disabled={busy}
                  onClick={reconnect}
                >
                  Try again
                </button>
              </p>
            )}
          </section>
        </div>
        <section className="daily-five__decision" aria-label="Place Daily Five ticket">
          <div className="daily-five__section-heading">
            <div>
              <span className="daily-five__eyebrow">3 · MAKE YOUR MOVE</span>
              <h2>{cash ? 'Hold cash' : `Trade ${selectedAsset.attemptAlias}`}</h2>
            </div>
            <span className="daily-five__ticket-chip">{stakeLabel} stake</span>
          </div>
          <p className="daily-five__muted">
            This round risks at most {stakeLabel}. Later rounds keep their own stake. Profits do not
            increase your budget.
          </p>
          <DirectionToggle
            value={cash ? null : currentDraft.side}
            disabled={controlsDisabled || cash}
            onChange={(side) => updateDraft({ side, kind: 'trade' })}
            namespace="daily-five"
          />
          <fieldset className="daily-five__leverage" disabled={controlsDisabled || cash}>
            <legend>Leverage · 1–100×</legend>
            <label>
              Set leverage directly
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                value={Number.isNaN(currentDraft.leverage) ? '' : currentDraft.leverage}
                aria-invalid={!validLeverage}
                aria-describedby="daily-five-leverage-help"
                onChange={(event) =>
                  updateDraft({
                    leverage: event.target.value === '' ? NaN : Number(event.target.value),
                  })
                }
              />
            </label>
            <div className="daily-five__leverage-presets" aria-label="Leverage presets">
              {LEVERAGE_PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset}
                  className={currentDraft.leverage === preset ? 'is-selected' : ''}
                  aria-pressed={currentDraft.leverage === preset}
                  onClick={() => updateDraft({ leverage: preset })}
                >
                  {preset}×
                </button>
              ))}
            </div>
            <p id="daily-five-leverage-help" className="daily-five__muted">
              {validLeverage
                ? 'Leverage multiplies market exposure and losses. Start at 1×.'
                : 'Enter a whole number from 1 to 100 before locking.'}
            </p>
          </fieldset>
          <div className="daily-five__trade-facts">
            <div>
              <span>Market exposure</span>
              <strong>{exposure === null ? 'Choose valid leverage' : ticketMoney(exposure)}</strong>
            </div>
            <div>
              <span>Approx. liquidation distance</span>
              <strong>
                {cash
                  ? 'No market risk'
                  : validLeverage
                    ? `${Math.max(0, 100 / currentDraft.leverage - 0.1).toFixed(2)}%`
                    : '—'}
              </strong>
            </div>
          </div>
          <p className="daily-five__muted">
            Maximum exposure: {ticketMoney(stake * 100)} at 100×. Fees reduce equity; liquidation
            can consume the entire stake. This simulated ticket does not move market prices.
          </p>
          <button
            type="button"
            className={`daily-five__cash-option ${cash ? 'is-selected' : ''}`}
            aria-pressed={cash}
            disabled={controlsDisabled}
            onClick={() => updateDraft({ kind: cash ? 'trade' : 'cash' })}
          >
            <GameIcon name="cash" size={18} />
            <span>
              <strong>Hold the {stakeLabel} ticket in cash</strong>
              <small>
                {cash ? 'Selected · no market exposure' : 'Keep this round’s stake unchanged'}
              </small>
            </span>
          </button>
          <div className="daily-five__commit">
            <span>
              {cash
                ? 'Cash selected'
                : `${selectedAsset.attemptAlias} · ${currentDraft.side === 'long' ? 'Long' : 'Short'} · ${validLeverage ? `${currentDraft.leverage}×` : 'Check leverage'}`}
            </span>
            <button
              type="button"
              className="daily-five__button daily-five__button--primary daily-five__lock"
              disabled={
                controlsDisabled ||
                (!cash && (!validLeverage || round.evidence.status === 'unavailable'))
              }
              onClick={() => void submit()}
            >
              {busy
                ? 'Checking saved progress…'
                : cash
                  ? `Lock ${stakeLabel} cash ticket`
                  : `Lock ${stakeLabel} trade`}{' '}
              <GameIcon name="lock" size={17} />
            </button>
          </div>
          <p className="daily-five__muted">
            Take your time. Once locked, the ticket is final and its historical result appears
            immediately.
          </p>
        </section>
      </div>
    </main>
  );
}

function DailyProgress({
  complete,
  current,
  ended = false,
  totalRounds = 5,
}: {
  complete: number;
  current: number | null;
  ended?: boolean;
  totalRounds?: number;
}) {
  return (
    <div className="daily-five__progress" aria-label="Round progress">
      <strong>
        {ended
          ? `${complete} played · run ended`
          : `${complete} complete · ${totalRounds - complete} remaining`}
      </strong>
      <ol>
        {Array.from({ length: totalRounds }, (_, index) => index + 1).map((number) => (
          <li
            key={number}
            aria-current={number === current ? 'step' : undefined}
            className={number <= complete ? 'is-complete' : number === current ? 'is-current' : ''}
          >
            <span>{number <= complete ? '✓' : number}</span>
            <span className="daily-five__step-label">
              {number <= complete
                ? 'Complete'
                : number === current
                  ? 'Current'
                  : ended
                    ? 'Not played'
                    : 'Remaining'}
            </span>
            <span className="game-ui__sr-only"> round {number}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

type PortfolioAct = (
  label: string,
  task: () => Promise<DailyAttemptView>,
) => Promise<DailyAttemptView | null>;

/** The v2 inspect → understand → allocate → lock workspace. */
function DailyFivePortfolioExperience({
  daily,
  attempt,
  mode,
  busy,
  transport,
  act,
  onStatus,
  dailyNumber,
  onChallengeFriend,
  showLeaderboard,
  onPracticeAgain,
}: {
  daily: DailyFivePublic;
  attempt: DailyAttemptView;
  mode: 'official' | 'practice';
  busy: boolean;
  transport: DailyFiveTransport;
  act: PortfolioAct;
  onStatus: (message: string) => void;
  dailyNumber?: string | number;
  onChallengeFriend?: (input: DailyFiveShareInput) => Promise<void> | void;
  showLeaderboard?: boolean;
  onPracticeAgain?: () => void;
}) {
  const round = attempt.round;
  const [selectedAssetId, setSelectedAssetId] = useState('');
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [leverage, setLeverage] = useState<Record<string, number>>({});
  const [selectedClueId, setSelectedClueId] = useState<Record<string, string>>({});
  const candidates = useMemo(
    () =>
      [...(round?.candidates ?? [])].sort((left, right) =>
        left.attemptAlias.localeCompare(right.attemptAlias, 'en', { numeric: true }),
      ),
    [round],
  );
  const roundIndex = round?.roundIndex ?? null;

  useEffect(() => {
    const first = candidates[0]?.assetId ?? '';
    setSelectedAssetId(first);
    if (!round) return;
    try {
      const saved = JSON.parse(
        localStorage.getItem(
          `whale-arena.daily-five-v2.${attempt.attemptId}.${round.roundIndex}`,
        ) ?? '{}',
      ) as unknown;
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        const next: Record<string, number> = {};
        const savedWeights =
          'weights' in saved && saved.weights && typeof saved.weights === 'object'
            ? (saved.weights as Record<string, unknown>)
            : (saved as Record<string, unknown>);
        const savedLeverage =
          'leverage' in saved && saved.leverage && typeof saved.leverage === 'object'
            ? (saved.leverage as Record<string, unknown>)
            : {};
        for (const candidate of candidates) {
          const value = savedWeights[candidate.assetId];
          if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 10_000)
            next[candidate.assetId] = value;
        }
        setWeights(next);
        const nextLeverage: Record<string, number> = {};
        for (const candidate of candidates) {
          const value = savedLeverage[candidate.assetId];
          if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 100)
            nextLeverage[candidate.assetId] = value;
        }
        setLeverage(nextLeverage);
        return;
      }
    } catch {
      /* A malformed local draft is discarded; the server remains authoritative. */
    }
    setWeights({});
    setLeverage({});
  }, [attempt.attemptId, roundIndex]);

  useEffect(() => {
    if (!roundIndex) return;
    try {
      localStorage.setItem(
        `whale-arena.daily-five-v2.${attempt.attemptId}.${roundIndex}`,
        JSON.stringify({ weights, leverage }),
      );
    } catch {
      /* Local draft persistence is best effort. */
    }
  }, [attempt.attemptId, roundIndex, weights, leverage]);

  if (!round || daily.rules.version !== 'daily-five-v2') return null;
  const currentRound = round;
  const selectedAsset =
    candidates.find((candidate) => candidate.assetId === selectedAssetId) ?? candidates[0];
  if (!selectedAsset) return <p>Today’s market case is still loading.</p>;
  const investedBps = candidates.reduce(
    (sum, candidate) => sum + (weights[candidate.assetId] ?? 0),
    0,
  );
  const cashBps = 10_000 - investedBps;
  const selectedClue = selectedAsset.unlockedClues.find(
    (clue) => clue.clueId === selectedClueId[selectedAsset.assetId],
  );
  const wallet = attempt.currentWallet ?? daily.rules.startingCapital;
  const walletNumber = moneyNumber(wallet);

  function percent(assetId: string): number {
    return Math.round((weights[assetId] ?? 0) / 100);
  }

  function setAssetPercent(assetId: string, nextPercent: number) {
    if (busy) return;
    const requested = Math.max(0, Math.min(100, Math.round(nextPercent))) * 100;
    const otherInvested = investedBps - (weights[assetId] ?? 0);
    const next = Math.min(requested, 10_000 - otherInvested);
    if (next < requested)
      onStatus('Cash is insufficient for that allocation. Reduce another position first.');
    setWeights((current) => ({ ...current, [assetId]: next }));
  }

  function setAssetLeverage(assetId: string, nextLeverage: number) {
    if (busy) return;
    const next = Math.max(1, Math.min(100, Math.round(nextLeverage)));
    setLeverage((current) => ({ ...current, [assetId]: next }));
  }

  async function unlock(clue: UnopenedClueDescriptor) {
    const updated = await act('Unlocking evidence', () =>
      transport.unlock(attempt.attemptId, {
        kind: 'unlock-clue',
        roundIndex: currentRound.roundIndex,
        assetId: selectedAsset.assetId,
        clueId: clue.clueId,
        expectedStateVersion: attempt.stateVersion,
        idempotencyKey: commandKey(`v2-clue-${currentRound.roundIndex}-${clue.clueId}`),
      }),
    );
    if (
      updated?.round?.candidates
        .find((asset) => asset.assetId === selectedAsset.assetId)
        ?.unlockedClues.some((answer) => answer.clueId === clue.clueId)
    )
      setSelectedClueId((current) => ({ ...current, [selectedAsset.assetId]: clue.clueId }));
  }

  async function lockPortfolio() {
    const allocations = candidates
      .map((candidate) => ({
        assetId: candidate.assetId,
        weightBps: weights[candidate.assetId] ?? 0,
        leverage: leverage[candidate.assetId] ?? 1,
      }))
      .filter((allocation) => allocation.weightBps > 0);
    await act('Locking your portfolio', () =>
      transport.submit(attempt.attemptId, {
        kind: 'portfolio',
        roundIndex: currentRound.roundIndex,
        allocations,
        cashWeightBps: cashBps,
        expectedStateVersion: attempt.stateVersion,
        idempotencyKey: commandKey(`v2-portfolio-${currentRound.roundIndex}`),
      }),
    );
  }

  return (
    <>
      <header className="daily-five__header daily-five-v2__header">
        <div>
          <span className="daily-five__eyebrow">
            DAILY FIVE · {mode === 'official' ? 'OFFICIAL ATTEMPT' : 'PRACTICE'} ·{' '}
            {currentRound.evidence.sourceKind === 'synthetic'
              ? 'SYNTHETIC PRACTICE DATA'
              : 'PROVIDER MARKET DATA'}
          </span>
          <h1 id="daily-five-title" tabIndex={-1}>
            Read the board. Make your call.
          </h1>
          <p>
            Round {round.roundIndex} of {daily.rules.totalRounds} · Build your wallet with measured
            decisions.
          </p>
        </div>
        <div className="daily-five__bank">
          <span>AVAILABLE WALLET</span>
          <strong>{ticketMoney(wallet)}</strong>
          <small>Starting wallet $10,000 · size your read · leverage 1–100×</small>
        </div>
      </header>
      <section className="daily-five-v2__candidates" aria-label="Five Daily Five candidates">
        {candidates.map((candidate) => (
          <button
            key={candidate.assetId}
            type="button"
            className={`daily-five__asset daily-five-v2__candidate ${candidate.assetId === selectedAsset.assetId ? 'is-selected' : ''}`}
            aria-pressed={candidate.assetId === selectedAsset.assetId}
            onClick={() => setSelectedAssetId(candidate.assetId)}
            disabled={busy}
          >
            <strong>{candidate.attemptAlias}</strong>
            <span>{formatAssetPrice(candidate.currentPrice ?? candidate.chart.at(-1)?.value)}</span>
            <span
              className={
                (candidate.changePct ?? '').startsWith('-') ? 'is-negative' : 'is-positive'
              }
            >
              {candidate.changePct ?? 'Unavailable'}
            </span>
            <span className="daily-five-v2__mini-spark">
              <PriceChart preDecision={candidate.chart} />
            </span>
            <small>
              {percent(candidate.assetId)}% allocated ·{' '}
              {candidate.volumeUsd ?? 'Volume unavailable'}
            </small>
          </button>
        ))}
      </section>
      <div className="daily-five-v2__workspace">
        <section className="daily-five-v2__research" aria-labelledby="daily-five-v2-research-title">
          <div className="daily-five-five__selected-heading daily-five__section-heading">
            <div>
              <span className="daily-five__eyebrow">INSPECT · {selectedAsset.attemptAlias}</span>
              <h2 id="daily-five-v2-research-title">What changed before the cutoff?</h2>
            </div>
            <span className="daily-five__selected-badge">Selected</span>
          </div>
          <div className="daily-five-v2__baseline" aria-label="Free baseline measurements">
            <MetricTile
              label="Current price"
              value={formatAssetPrice(
                selectedAsset.currentPrice ?? selectedAsset.chart.at(-1)?.value,
              )}
            />
            <MetricTile label="6h change" value={selectedAsset.changePct ?? 'Unavailable'} />
            <MetricTile label="6h volume" value={selectedAsset.volumeUsd ?? 'Unavailable'} />
            <MetricTile
              label="Liquidity snapshot"
              value={selectedAsset.liquidityUsd ?? 'Unavailable'}
            />
          </div>
          <PriceChart
            preDecision={selectedAsset.chart}
            cutoffAt={round.cutoffAt}
            label={`${selectedAsset.attemptAlias} six hour evidence chart`}
            accent="var(--daily-accent)"
          />
          <p className="daily-five__muted">
            {selectedAsset.chart.length} completed price observations · cutoff{' '}
            {evidenceWindow(selectedAsset.chart[0]?.at, round.cutoffAt)} UTC ·{' '}
            {currentRound.evidence.sourceKind === 'synthetic'
              ? 'Synthetic scenario.'
              : 'Provider market data.'}
          </p>
          <div className="daily-five-v2__evidence-heading">
            <div>
              <span className="daily-five__eyebrow">UNDERSTAND · RESEARCH</span>
              <h2>Buy better information</h2>
            </div>
            <span className="daily-five__ticket-chip">
              {round.unlocksRemaining} of 3 credits left
            </span>
          </div>
          <div className="daily-five-v2__clues">
            {selectedAsset.clueDescriptors.map((descriptor) => {
              const revealed = selectedAsset.unlockedClues.some(
                (clue) => clue.clueId === descriptor.clueId,
              );
              const selected = selectedClueId[selectedAsset.assetId] === descriptor.clueId;
              return (
                <button
                  type="button"
                  key={descriptor.clueId}
                  className={`daily-five__clue ${selected ? 'is-selected' : ''}`}
                  aria-pressed={selected}
                  disabled={busy || (!revealed && round.unlocksRemaining === 0)}
                  onClick={() =>
                    revealed
                      ? setSelectedClueId((current) => ({
                          ...current,
                          [selectedAsset.assetId]: descriptor.clueId,
                        }))
                      : void unlock(descriptor)
                  }
                >
                  <strong>{EVIDENCE_CATEGORY_LABELS[descriptor.category]}</strong>
                  <span>{CLUE_QUESTIONS[descriptor.category]}</span>
                  <small>{revealed ? 'Unlocked · open' : 'Unlock · 1 credit'}</small>
                </button>
              );
            })}
          </div>
          {selectedClue ? (
            <ClueAnswer clue={selectedClue} />
          ) : (
            <p className="daily-five__clue-hint">
              Choose a category to see two measured values, its baseline, and a plausible
              alternative explanation.
            </p>
          )}
        </section>
        <aside className="daily-five-v2__portfolio" aria-labelledby="daily-five-v2-portfolio-title">
          <div className="daily-five__section-heading">
            <div>
              <span className="daily-five__eyebrow">ALLOCATE · PORTFOLIO</span>
              <h2 id="daily-five-v2-portfolio-title">Build your position</h2>
            </div>
            <span className="daily-five__ticket-chip">{cashBps / 100}% cash</span>
          </div>
          <p className="daily-five__muted">
            Adjust the colored bar in whole percentage points. Set leverage per position; a high
            multiple can magnify gains, losses, and liquidation risk.
          </p>
          <div className="daily-five-v2__allocation-list">
            {candidates.map((candidate) => (
              <div className="daily-five-v2__allocation" key={candidate.assetId}>
                <div>
                  <strong>{candidate.attemptAlias}</strong>
                  <span className="daily-five-v2__allocation-amount">
                    Bet {ticketMoney((percent(candidate.assetId) / 100) * walletNumber)}
                  </span>
                </div>
                <label className="daily-five-v2__allocation-field">
                  <span>Amount</span>
                  <input
                    aria-label={`${candidate.attemptAlias} amount slider`}
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={percent(candidate.assetId)}
                    style={{
                      background: `linear-gradient(90deg, var(--daily-accent) ${percent(candidate.assetId)}%, var(--daily-border-strong) ${percent(candidate.assetId)}%)`,
                    }}
                    onChange={(event) =>
                      setAssetPercent(candidate.assetId, Number(event.target.value))
                    }
                    disabled={busy || walletNumber === 0}
                  />
                  <span className="daily-five-v2__money-input">
                    <b aria-hidden="true">$</b>
                    <input
                      aria-label={`${candidate.attemptAlias} amount in dollars`}
                      type="text"
                      inputMode="decimal"
                      value={compactAmountInput((percent(candidate.assetId) / 100) * walletNumber)}
                      onChange={(event) =>
                        setAssetPercent(
                          candidate.assetId,
                          walletNumber
                            ? (parseCompactAmount(event.target.value) / walletNumber) * 100
                            : 0,
                        )
                      }
                      disabled={busy || walletNumber === 0}
                    />
                  </span>
                </label>
                <label className="daily-five-v2__leverage-field">
                  <span>Leverage</span>
                  <input
                    aria-label={`${candidate.attemptAlias} leverage slider`}
                    className="daily-five-v2__leverage-slider"
                    type="range"
                    min="1"
                    max="100"
                    step="1"
                    value={leverage[candidate.assetId] ?? 1}
                    style={{
                      background: `linear-gradient(90deg, var(--daily-accent) ${(((leverage[candidate.assetId] ?? 1) - 1) / 99) * 100}%, var(--daily-border-strong) ${(((leverage[candidate.assetId] ?? 1) - 1) / 99) * 100}%)`,
                    }}
                    onChange={(event) =>
                      setAssetLeverage(candidate.assetId, Number(event.target.value))
                    }
                    disabled={busy}
                  />
                  <span className="daily-five-v2__leverage-input">
                    <input
                      aria-label={`${candidate.attemptAlias} leverage`}
                      type="number"
                      min="1"
                      max="100"
                      step="1"
                      value={leverage[candidate.assetId] ?? 1}
                      onChange={(event) =>
                        setAssetLeverage(candidate.assetId, Number(event.target.value))
                      }
                      disabled={busy}
                    />
                    <b aria-hidden="true">×</b>
                  </span>
                </label>
              </div>
            ))}
          </div>
          <div
            className="daily-five-v2__allocation-bar"
            aria-label={`${ticketMoney((investedBps / 10_000) * walletNumber)} invested and ${ticketMoney((cashBps / 10_000) * walletNumber)} cash`}
          >
            {candidates.map((candidate) => (
              <span
                key={candidate.assetId}
                title={`${candidate.attemptAlias}: ${percent(candidate.assetId)}%`}
                style={{ width: `${percent(candidate.assetId)}%` }}
              />
            ))}
            <i style={{ width: `${cashBps / 100}%` }} />
          </div>
          <p className="daily-five-v2__cash-note">
            {cashBps / 100}% cash remainder · {ticketMoney((cashBps / 10_000) * walletNumber)}
          </p>
          <button
            type="button"
            className="daily-five__button daily-five__button--primary daily-five-v2__lock"
            onClick={() => void lockPortfolio()}
            disabled={busy}
          >
            Lock my call &amp; reveal <GameIcon name="lock" size={17} />
          </button>
          <button
            type="button"
            className="daily-five__button"
            onClick={() => {
              setWeights({});
              setLeverage({});
              onStatus('Draft reset to 100% cash.');
            }}
            disabled={busy}
          >
            Reset to cash
          </button>
          <p className="daily-five__muted">
            Costs apply only to invested allocations. One lock saves the whole round.
          </p>
        </aside>
      </div>
      <p className="daily-five-v2__provenance">
        {currentRound.evidence.sourceKind === 'synthetic'
          ? 'Synthetic practice data. No real market claim is made.'
          : 'Historical provider data. Prices and clues are measured before each cutoff.'}{' '}
        Sources: {selectedAsset.attribution.map((item) => item.label).join(', ')}.
      </p>
      {attempt.finalResult && (
        <DailyFiveFinal
          daily={daily}
          attempt={attempt}
          mode={mode}
          dailyNumber={dailyNumber}
          onStatus={onStatus}
          onChallengeFriend={onChallengeFriend}
          showLeaderboard={showLeaderboard}
          onPracticeAgain={onPracticeAgain}
        />
      )}
    </>
  );
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="daily-five-v2__metric">
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

interface ResultClue {
  readonly clue: RevealedClue;
  readonly assetLabel: string;
}

function ClueSlots({ clues }: { clues: readonly ResultClue[] }) {
  return (
    <div className="daily-five-v2__clue-slots" aria-label="Clue results">
      {Array.from({ length: 3 }, (_, index) => (
        <ClueSlot
          key={clues[index]?.clue.clueId ?? `empty-${index}`}
          index={index + 1}
          clue={clues[index]?.clue}
          assetLabel={clues[index]?.assetLabel}
          selected={false}
        />
      ))}
    </div>
  );
}

function ClueSlot({
  index,
  clue,
  assetLabel,
  selected,
  onSelect,
}: {
  index: number;
  clue?: RevealedClue;
  assetLabel?: string;
  selected: boolean;
  onSelect?: () => void;
}) {
  const content = (
    <>
      <div className="daily-five-v2__clue-slot-heading">
        <span className="daily-five__eyebrow">CLUE {index}</span>
        <strong>
          {clue ? (assetLabel ?? EVIDENCE_CATEGORY_LABELS[clue.category]) : 'NOT USED'}
        </strong>
      </div>
      {clue ? (
        <>
          {assetLabel && (
            <small className="daily-five-v2__clue-slot-category">
              {EVIDENCE_CATEGORY_LABELS[clue.category]}
            </small>
          )}
          <h3>{clue.factualHeadline}</h3>
          <div className="daily-five-v2__clue-slot-metrics">
            {clue.metrics.map((metric) => (
              <span key={metric.label}>
                <small>{metric.label}</small>
                <strong>{metric.value}</strong>
              </span>
            ))}
          </div>
          <p>{clue.interpretation}</p>
          <small className="daily-five-v2__clue-slot-footnote">
            Evidence ends {new Date(clue.evidenceCutoff).toUTCString()}
          </small>
        </>
      ) : (
        <p className="daily-five-v2__clue-slot-empty">Not used this round.</p>
      )}
    </>
  );

  if (!clue || !onSelect)
    return (
      <article
        className={`daily-five-v2__clue-slot ${clue ? 'is-used' : 'is-empty'} ${selected ? 'is-selected' : ''}`}
      >
        {content}
      </article>
    );

  return (
    <button
      type="button"
      className={`daily-five-v2__clue-slot is-used ${selected ? 'is-selected' : ''}`}
      aria-pressed={selected}
      aria-label={`Open clue ${index}: ${EVIDENCE_CATEGORY_LABELS[clue.category]}`}
      onClick={onSelect}
    >
      {content}
    </button>
  );
}

function formatAssetPrice(value: string | undefined): string {
  if (!value) return 'Unavailable';
  const number = Number(value);
  if (!Number.isFinite(number)) return 'Unavailable';
  const decimals = Math.min(8, Math.max(2, (value.split('.')[1] ?? '').replace(/0+$/, '').length));
  return `$${number.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

function evidenceWindow(start: string | undefined, cutoff: string): string {
  const format = (value: string) =>
    new Date(value).toLocaleString('en-GB', {
      timeZone: 'UTC',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  return `${start ? format(start) : 'Published start'} – ${format(cutoff)} UTC`;
}

function ClueAnswer({ clue }: { clue: RevealedClue }) {
  return (
    <aside className="daily-five__clue-answer" aria-live="polite">
      <span className="daily-five__eyebrow">SELECTED EVIDENCE</span>
      <h3>{clue.factualHeadline}</h3>
      <div className="daily-five__metrics">
        {clue.metrics.map((metric) => (
          <span key={metric.label}>
            <small>{metric.label}</small>
            <strong>{metric.value}</strong>
            {metric.baseline && (
              <em>
                {metric.baseline.label}: {metric.baseline.value}
              </em>
            )}
          </span>
        ))}
      </div>
      <p>{clue.interpretation}</p>
      <p className="daily-five__muted">
        Evidence ends {new Date(clue.evidenceCutoff).toUTCString()}
      </p>
      <details>
        <summary>Source and limitations</summary>
        {clue.limitation && <p className="daily-five__muted">Limit: {clue.limitation}</p>}
      </details>
    </aside>
  );
}

export { buildDailyFiveShareText, calculateAccuracyLabel, dailyNumberFromId, revealAsset };
export type { DailyDraft };
