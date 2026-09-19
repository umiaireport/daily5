import { useEffect, useRef, useState } from 'react';
import type { RoundResult } from '../../shared/types';
import { Icon, money, percent, Sparkline, tokenStyle } from './Visuals';
import { downloadScorecard } from '../share';

export function Results({
  result,
  busy,
  onContinue,
  onLeaderboard,
}: {
  result: RoundResult;
  busy: boolean;
  onContinue: () => void;
  onLeaderboard: () => void;
}) {
  const [shareError, setShareError] = useState('');
  const heading = useRef<HTMLElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, [result.scenarioId]);
  async function share() {
    try {
      await downloadScorecard(result);
      setShareError('');
    } catch (error) {
      setShareError((error as Error).message);
    }
  }
  return (
    <section className="results" aria-labelledby="result-title" ref={heading} tabIndex={-1}>
      <div className="result-hero">
        <div>
          <div className="eyebrow mint">
            <Icon name={result.complete ? 'trophy' : 'check'} size={15} />
            {result.complete ? 'EXPEDITION COMPLETE' : 'CHOICE LOCKED · FUTURE REVEALED'}
          </div>
          <h2 id="result-title">
            {result.complete
              ? 'You’ve read the current.'
              : result.returnPct > result.benchmarkPct
                ? 'A little signal. A smart move.'
                : 'Every current teaches you something.'}
          </h2>
          <p>
            {result.complete
              ? `${result.totalRounds} round${result.totalRounds === 1 ? '' : 's'}, clues, and a few lessons from the deep.`
              : 'The next 24 hours are in. Here’s how your decision played out.'}
          </p>
        </div>
        <span className="result-seal">
          <Icon name="trophy" size={42} />
        </span>
      </div>
      <div className="score-grid">
        <div className="score-card featured">
          <span>
            {result.complete ? `${result.totalRounds}-ROUND RETURN` : 'YOUR ROUND RETURN'}
          </span>
          <strong
            className={
              (result.complete ? result.sessionReturnPct : result.returnPct) >= 0
                ? 'mint'
                : 'negative'
            }
          >
            {percent(result.complete ? result.sessionReturnPct : result.returnPct)}
          </strong>
          <small>
            {money(result.complete ? result.sessionEquity : result.endEquity)} virtual equity
          </small>
        </div>
        <div className="score-card">
          <span>EQUAL-WEIGHT BENCHMARK</span>
          <strong>{percent(result.benchmarkPct)}</strong>
          <small>This round · ⅓ in each token, same costs</small>
        </div>
        <div className="score-card">
          <span>CASH BENCHMARK</span>
          <strong>0.00%</strong>
          <small>This round · cash sits this one out</small>
        </div>
      </div>
      <div className="section-label">
        <h3>The identities behind the signal</h3>
        <span>
          {result.mode === 'live' ? 'NANSEN LIVE REPLAY · 24H' : 'SYNTHETIC OUTCOME · 24H'}
        </span>
      </div>
      <div className="token-grid reveal-grid">
        {result.assets.map((asset, index) => (
          <article key={asset.id} className="revealed-card" style={tokenStyle(index)}>
            <div className="reveal-top">
              <div>
                <span className="token-label">
                  {asset.alias} → {asset.symbol}
                </span>
                <h3>{asset.name}</h3>
              </div>
              <strong className={asset.returnPct >= 0 ? 'mint' : 'negative'}>
                {percent(asset.returnPct)}
              </strong>
            </div>
            <Sparkline
              values={asset.series}
              color="var(--token)"
              label={`${asset.name} synthetic outcome price`}
            />
            <div className="price-pair">
              <span>
                ENTRY <strong>${asset.entryPrice.toFixed(4)}</strong>
              </span>
              <Icon name="arrow" size={14} />
              <span>
                EXIT <strong>${asset.exitPrice.toFixed(4)}</strong>
              </span>
            </div>
            <p>{asset.explanation}</p>
            <div className="position-label">
              Your position <strong>{result.weights[index]}%</strong>
            </div>
          </article>
        ))}
      </div>
      <div className="result-bottom">
        <div>
          <span className="eyebrow">EXPEDITION PORTFOLIO</span>
          <strong>
            {money(result.sessionEquity)}{' '}
            <small className={result.sessionReturnPct >= 0 ? 'mint' : 'negative'}>
              {percent(result.sessionReturnPct)}
            </small>
          </strong>
          <p>
            Compounded across {result.index} of {result.totalRounds} rounds · costs included
          </p>
        </div>
        <div className="result-actions">
          <button className="secondary" onClick={() => void share()}>
            <Icon name="download" /> Share scorecard
          </button>
          {result.complete && (
            <button className="secondary" onClick={onLeaderboard}>
              <Icon name="trophy" /> Leaderboard
            </button>
          )}
          <button className="primary" onClick={onContinue} disabled={busy}>
            {result.complete
              ? 'Play again'
              : `Next round · ${result.index + 1}/${result.totalRounds}`}
            <Icon name="arrow" />
          </button>
        </div>
      </div>
      {shareError && (
        <p role="alert" className="error">
          {shareError}
        </p>
      )}
      <p className="result-disclaimer">
        {result.mode === 'live'
          ? 'This is a current-data replay powered by Nansen API. Clues describe observed activity; they do not guarantee an outcome. Token price returns above exclude costs; portfolio returns include them.'
          : 'These tokens and market observations are fictional. Clues describe past activity; they do not guarantee an outcome. Token price returns above exclude costs; portfolio returns include them.'}
      </p>
    </section>
  );
}
