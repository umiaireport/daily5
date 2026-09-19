import { useState } from 'react';
import type { CardKind, Clue, Round, Weights } from '../../shared/types';
import { Icon, money, Sparkline, tokenStyle } from './Visuals';
import { Modal } from './Modal';

const cards: { kind: CardKind; title: string; description: string }[] = [
  { kind: 'flow', title: 'Follow the Funds', description: 'Where is the money moving?' },
  { kind: 'buyers', title: 'Trading Footprints', description: 'Who is making a move?' },
  { kind: 'pulse', title: 'Market Pulse', description: 'What is the market telling us?' },
];

export function Arena({
  round,
  busy,
  onUnlock,
  onLock,
}: {
  round: Round;
  busy: boolean;
  onUnlock: (assetId: string, kind: CardKind) => Promise<Clue | undefined>;
  onLock: (weights: Weights) => void;
}) {
  const [weights, setWeights] = useState<Weights>(round.weights ?? [0, 0, 0, 100]);
  const [clue, setClue] = useState<{ alias: string; content: Clue } | null>(null);
  const [confirmCash, setConfirmCash] = useState(false);
  function adjust(index: number, value: number) {
    setWeights((current) => {
      const next = [...current] as Weights;
      const clamped = Math.max(0, Math.min(value, current[index] + current[3]));
      next[index] = clamped;
      next[3] = current[3] - (clamped - current[index]);
      return next;
    });
  }
  async function openClue(assetId: string, alias: string, kind: CardKind) {
    const existing = round.assets.find((a) => a.id === assetId)?.clues[kind];
    const content = existing ?? (await onUnlock(assetId, kind));
    if (content) setClue({ alias, content });
  }
  return (
    <>
      <section className="arena-heading" id="arena-board" tabIndex={-1}>
        <div>
          <div className="eyebrow">
            <span className="dot" /> THE ARENA <span className="slash">/</span>{' '}
            {round.mode === 'live' ? 'NANSEN LIVE SIGNAL' : 'BASE ECOSYSTEM'}
          </div>
          <h2>Find the signal.</h2>
          <p>
            {round.index === 1
              ? 'Three mystery tokens. Two clues. Where will you place your conviction?'
              : round.subtitle}
          </p>
          <span className="scenario-title">
            ROUND {String(round.index).padStart(2, '0')} · {round.title}
          </span>
        </div>
        <div className="clue-budget" aria-label={`${round.unlocksRemaining} clues remaining`}>
          <span>YOUR INTEL BUDGET</span>
          <div>
            {[0, 1].map((i) => (
              <span key={i} className={`credit ${i < round.unlocksRemaining ? 'available' : ''}`}>
                <Icon name={i < round.unlocksRemaining ? 'pulse' : 'check'} size={15} />
              </span>
            ))}
            <strong>
              {round.unlocksRemaining}
              <small> / 2 clues</small>
            </strong>
          </div>
        </div>
      </section>
      <div className="token-grid">
        {round.assets.map((asset, index) => (
          <article className="token-card" key={asset.id} style={tokenStyle(index)}>
            <div className="token-top">
              <span className="token-index">
                0{index + 1} <span>/ MYSTERY ASSET</span>
              </span>
              <span className="chain-mark" title={asset.category}>
                {round.mode === 'live' ? 'LIVE' : '—'}
              </span>
            </div>
            <div className="token-identity">
              <div className={`token-orb orb-${index}`}>
                <span>{['◈', '⌁', '✳'][index]}</span>
              </div>
              <div>
                <h3>{asset.alias}</h3>
                <p>Identity revealed after lock</p>
              </div>
              <Icon name="lock" size={16} />
            </div>
            <Sparkline values={asset.series} color="var(--token)" />
            <div className="chart-caption">
              <span>PRE-DECISION PRICE</span>
              <span>
                24H <span className="mini-dot" />
              </span>
            </div>
            <div className="intel-list">
              {cards.map((card) => {
                const opened = !!asset.clues[card.kind];
                return (
                  <button
                    key={card.kind}
                    className={`intel-button ${opened ? 'opened' : ''}`}
                    disabled={busy || (!opened && round.unlocksRemaining === 0)}
                    onClick={() => void openClue(asset.id, asset.alias, card.kind)}
                    aria-label={`${opened ? 'View' : 'Unlock'} ${card.title} for ${asset.alias}`}
                  >
                    <span className="intel-icon">
                      <Icon name={card.kind} />
                    </span>
                    <span>
                      <strong>{card.title}</strong>
                      <small>{opened ? asset.clues[card.kind]!.headline : card.description}</small>
                    </span>
                    <span className="intel-cost">
                      {opened ? (
                        <Icon name="check" size={15} />
                      ) : (
                        <>
                          <Icon name="lock" size={12} />
                          <span>1</span>
                        </>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="allocation">
              <div className="allocation-label">
                <label htmlFor={`allocation-${asset.id}`}>YOUR ALLOCATION</label>
                <strong>
                  {weights[index]}
                  <span>%</span>
                </strong>
              </div>
              <input
                id={`allocation-${asset.id}`}
                type="range"
                min="0"
                max="100"
                step="10"
                value={weights[index]}
                disabled={busy}
                onChange={(event) => adjust(index, Number(event.target.value))}
                aria-label={`${asset.alias} allocation`}
                style={{
                  background: `linear-gradient(to right, var(--token) ${weights[index]}%, #252d36 ${weights[index]}%)`,
                }}
              />
              <div className="allocation-bottom">
                <span>{money(weights[index] * 100)} virtual</span>
                <div>
                  <button
                    aria-label={`Decrease ${asset.alias} allocation`}
                    disabled={busy || weights[index] === 0}
                    onClick={() => adjust(index, weights[index] - 10)}
                  >
                    −
                  </button>
                  <button
                    aria-label={`Increase ${asset.alias} allocation`}
                    disabled={busy || weights[3] === 0}
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
          {busy ? 'Locking…' : 'Lock & reveal'}
          <Icon name="arrow" size={18} />
        </button>
      </section>
      <div className="round-footnote">
        <span>
          <Icon name="lock" size={13} /> Your choice is final. The next 24 hours are revealed after
          you lock.
        </span>
        <span>0.30% entry + exit cost · No real money</span>
      </div>
      {clue && (
        <Modal title={clue.content.title} onClose={() => setClue(null)}>
          <div className="eyebrow mint">
            {clue.alias} · {round.mode === 'live' ? 'NANSEN API SIGNAL' : 'SYNTHETIC INTELLIGENCE'}
          </div>
          <h3 className="clue-headline">{clue.content.headline}</h3>
          <p className="modal-copy">{clue.content.detail}</p>
          <div className="clue-metrics">
            {clue.content.metrics.map((metric) => (
              <div key={metric.label}>
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
          <p className="coverage-note">{clue.content.warning}</p>
          <p className="timestamp">
            {round.mode === 'live' ? 'Observed' : 'Fixture cutoff'}:{' '}
            {new Date(clue.content.observedAt).toUTCString()}
          </p>
          <button className="primary full" onClick={() => setClue(null)}>
            Back to the arena <Icon name="arrow" />
          </button>
        </Modal>
      )}
      {confirmCash && (
        <Modal title="Stay on the sidelines?" onClose={() => setConfirmCash(false)}>
          <p className="modal-copy">
            You’re keeping all $10,000 in cash. That’s a valid strategy: your round return will be
            0%, while the three tokens move without you.
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
