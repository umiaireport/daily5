import { useState } from 'react';
import type { Clue, Weights } from '../../shared/types';
import { Icon, money, percent, Sparkline, tokenStyle } from './Visuals';
import { Modal } from './Modal';

export interface DailyAsset {
  id: string;
  alias: string;
  category: string;
  series: number[];
  clues: Record<string, Clue>;
}

export interface DailyChallengePayload {
  id: string;
  version: string;
  evidenceVersion: string;
  assetIds: [string, string, string];
  evidence: {
    mode?: 'synthetic' | 'live';
    sourceLabel?: string;
    sourceUrl?: string;
    observedAt: string;
    title: string;
    subtitle: string;
    assets: DailyAsset[];
  };
  rules: { version: string; startCash: number; entryCostBps: number; exitCostBps: number };
  opensAt: string;
  locksAt: string;
  entryAt: string;
  settleAt: string;
  voidAt: string;
}

export interface DailySummary {
  id: string;
  available: boolean;
  status: 'pending' | 'settled' | 'void';
  mode: 'synthetic' | 'live';
  opensAt: string;
  locksAt: string;
  entryAt: string;
  settleAt: string;
  voidAt: string;
  challenge: DailyChallengePayload;
}

export type DailyEntryResult =
  | { status: 'pending'; challengeId: string; weights: Weights }
  | {
      status: 'settled';
      challengeId: string;
      weights: Weights;
      endEquity: number;
      returnPct: number;
      benchmarkPct: number;
      cashPct: number;
    }
  | { status: 'void'; challengeId: string; weights: Weights; reason: string };

export function DailyChallenge({
  daily,
  result,
  busy,
  onLock,
}: {
  daily: DailySummary;
  result: DailyEntryResult | null;
  busy: boolean;
  onLock: (weights: Weights) => void;
}) {
  const [weights, setWeights] = useState<Weights>(result?.weights ?? [0, 0, 0, 100]);
  const [confirmCash, setConfirmCash] = useState(false);
  const [selectedClue, setSelectedClue] = useState<Clue | null>(null);
  const assets = daily.challenge.evidence.assets;
  const locked = Boolean(result) || daily.status !== 'pending' || !daily.available;

  function adjust(index: number, value: number) {
    setWeights((current) => {
      const next = [...current] as Weights;
      const clamped = Math.max(0, Math.min(value, current[index] + current[3]));
      next[index] = clamped;
      next[3] = current[3] - (clamped - current[index]);
      return next;
    });
  }

  return (
    <>
      <section className="arena-heading" id="daily-board" tabIndex={-1}>
        <div>
          <div className="eyebrow mint">
            <Icon name="pulse" size={16} /> THE DAILY EXPEDITION <span className="slash">/</span>{' '}
            {daily.mode === 'live' ? 'NANSEN LIVE SIGNAL' : 'SYNTHETIC PRACTICE'}
          </div>
          <h2>{daily.challenge.evidence.title}</h2>
          <p>{daily.challenge.evidence.subtitle}</p>
          <span className="scenario-title">
            {daily.status === 'pending' && daily.available
              ? `LOCKS ${new Date(daily.locksAt).toUTCString()}`
              : daily.status === 'settled'
                ? 'SETTLED · SCORE FROZEN'
                : daily.status === 'void'
                  ? 'VOID · INCOMPLETE SETTLEMENT'
                  : 'ENTRY WINDOW CLOSED'}
          </span>
        </div>
        <div className="clue-budget" aria-label="Daily evidence snapshot">
          <span>DAILY EVIDENCE</span>
          <div>
            <span className="credit available">
              <Icon name="pulse" size={15} />
            </span>
            <strong>
              {assets.reduce((total, asset) => total + Object.keys(asset.clues).length, 0)}
              <small> signals</small>
            </strong>
          </div>
        </div>
      </section>
      <div className="mode-notice">
        <span className="notice-dot" />
        <span>
          Observed {new Date(daily.challenge.evidence.observedAt).toUTCString()} ·{' '}
          {daily.challenge.evidence.sourceUrl ? (
            <a href={daily.challenge.evidence.sourceUrl} target="_blank" rel="noreferrer">
              {daily.challenge.evidence.sourceLabel ?? 'Nansen API'}
            </a>
          ) : (
            (daily.challenge.evidence.sourceLabel ?? 'Synthetic fixture')
          )}{' '}
          · no real trades.
        </span>
        <span>Settlement opens {new Date(daily.settleAt).toUTCString()}</span>
      </div>
      <div className="token-grid">
        {assets.map((asset, index) => (
          <article className="token-card" key={asset.id} style={tokenStyle(index)}>
            <div className="token-top">
              <span className="token-index">
                0{index + 1} <span>/ DAILY SIGNAL</span>
              </span>
              <span className="chain-mark">{daily.mode === 'live' ? 'LIVE' : 'PRACTICE'}</span>
            </div>
            <div className="token-identity">
              <div className={`token-orb orb-${index}`}>
                <span>{['◈', '⌁', '✳'][index]}</span>
              </div>
              <div>
                <h3>{asset.alias}</h3>
                <p>{asset.category}</p>
              </div>
              <Icon name="pulse" size={16} />
            </div>
            <Sparkline values={asset.series} color="var(--token)" />
            <div className="chart-caption">
              <span>PRE-DECISION PRICE</span>
              <span>
                24H <span className="mini-dot" />
              </span>
            </div>
            <div className="intel-list">
              {Object.values(asset.clues).map((clue) => (
                <button
                  key={clue.kind}
                  className="intel-button opened"
                  disabled={busy}
                  onClick={() => setSelectedClue(clue)}
                  aria-label={`Read ${clue.title} for ${asset.alias}`}
                >
                  <span className="intel-icon">
                    <Icon name={clue.kind} />
                  </span>
                  <span>
                    <strong>{clue.title}</strong>
                    <small>{clue.headline}</small>
                  </span>
                  <span className="intel-cost">
                    <Icon name="check" size={15} />
                  </span>
                </button>
              ))}
            </div>
            <div className="allocation">
              <div className="allocation-label">
                <label htmlFor={`daily-allocation-${asset.id}`}>YOUR ALLOCATION</label>
                <strong>
                  {weights[index]}
                  <span>%</span>
                </strong>
              </div>
              <input
                id={`daily-allocation-${asset.id}`}
                type="range"
                min="0"
                max="100"
                step="10"
                value={weights[index]}
                disabled={busy || locked}
                onChange={(event) => adjust(index, Number(event.target.value))}
                aria-label={`${asset.alias} daily allocation`}
                style={{
                  background: `linear-gradient(to right, var(--token) ${weights[index]}%, #252d36 ${weights[index]}%)`,
                }}
              />
              <div className="allocation-bottom">
                <span>{money(weights[index] * 100)} virtual</span>
                <div>
                  <button
                    aria-label={`Decrease ${asset.alias} daily allocation`}
                    disabled={busy || locked || weights[index] === 0}
                    onClick={() => adjust(index, weights[index] - 10)}
                  >
                    −
                  </button>
                  <button
                    aria-label={`Increase ${asset.alias} daily allocation`}
                    disabled={busy || locked || weights[3] === 0}
                    onClick={() => adjust(index, weights[index] + 10)}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
      {result?.status === 'settled' && (
        <section className="score-grid">
          <div className="score-card featured">
            <span>DAILY RETURN</span>
            <strong className={result.returnPct >= 0 ? 'mint' : 'negative'}>
              {percent(result.returnPct)}
            </strong>
            <small>{money(result.endEquity)} virtual equity</small>
          </div>
          <div className="score-card">
            <span>EQUAL-WEIGHT BENCHMARK</span>
            <strong>{percent(result.benchmarkPct)}</strong>
            <small>Same costs · ⅓ in each token</small>
          </div>
          <div className="score-card">
            <span>CASH BENCHMARK</span>
            <strong>0.00%</strong>
            <small>Cash sits this one out</small>
          </div>
        </section>
      )}
      {result?.status === 'void' && (
        <div className="error" role="status">
          Daily settlement was voided: {result.reason}
        </div>
      )}
      {result?.status === 'pending' && (
        <div className="mode-notice">
          <span className="notice-dot" /> Allocation locked. Your official score will be published
          after the 24-hour settlement window.
        </div>
      )}
      {!result && !daily.available && daily.status === 'pending' && (
        <div className="mode-notice">
          <span className="notice-dot" /> The entry window is closed. Check back for the next daily
          signal.
        </div>
      )}
      {!result && daily.available && (
        <section className="decision-bar">
          <div className="cash">
            <span className="cash-icon">
              <Icon name="cash" size={24} />
            </span>
            <div>
              <span>CASH RESERVE</span>
              <strong>
                {money(weights[3] * 100)} <small>{weights[3]}%</small>
              </strong>
            </div>
          </div>
          <div className="allocation-summary">
            <div className="allocation-track">
              {weights.map((weight, index) => (
                <span
                  key={index}
                  style={{
                    width: `${weight}%`,
                    background: ['#69ddbb', '#9d9af5', '#edb975', '#485362'][index],
                  }}
                />
              ))}
            </div>
            <span>
              {100 - weights[3]}% invested <span>100% allocated · cash included</span>
            </span>
          </div>
          <button
            className="primary lock-button"
            disabled={busy}
            onClick={() => (weights[3] === 100 ? setConfirmCash(true) : onLock(weights))}
          >
            <Icon name="lock" size={17} />
            {busy ? 'Locking…' : 'Lock daily entry'}
            <Icon name="arrow" size={18} />
          </button>
        </section>
      )}
      <div className="round-footnote">
        <span>
          <Icon name="lock" size={13} /> One official entry per session. Your choice is final.
        </span>
        <span>0.30% entry + exit cost · No real money</span>
      </div>
      {selectedClue && (
        <Modal title={selectedClue.title} onClose={() => setSelectedClue(null)}>
          <h3 className="clue-headline">{selectedClue.headline}</h3>
          <p className="modal-copy">{selectedClue.detail}</p>
          <div className="clue-metrics">
            {selectedClue.metrics.map((metric) => (
              <div key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
          <p className="coverage-note">{selectedClue.warning}</p>
          <button className="primary full" onClick={() => setSelectedClue(null)}>
            Back to the daily signal <Icon name="arrow" />
          </button>
        </Modal>
      )}
      {confirmCash && (
        <Modal title="Stay on the sidelines?" onClose={() => setConfirmCash(false)}>
          <p className="modal-copy">
            You’re keeping all $10,000 in cash. That’s a valid daily strategy: your score will be 0%
            while the three signals move without you.
          </p>
          <div className="dialog-actions">
            <button className="secondary" onClick={() => setConfirmCash(false)}>
              Keep exploring
            </button>
            <button
              className="primary"
              onClick={() => {
                setConfirmCash(false);
                onLock(weights);
              }}
            >
              Lock 100% cash
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
