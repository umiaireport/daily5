import type { ProgressionView, ResultComparison } from '../../shared/progression.js';
import './profile.css';

export interface ProfileProps {
  readonly view: ProgressionView;
  readonly comparison?: ResultComparison | null;
  readonly rematchHref?: string;
  readonly roleSwapHref?: string;
}

function signed(value: string): string {
  return value.startsWith('-') ? `${value}%` : `+${value}%`;
}

function displayRole(role: ProgressionView['huntHistory'][number]['role']): string {
  return role === 'captain' ? 'Tracer captain' : role[0]!.toUpperCase() + role.slice(1);
}

/** Renders the progression profile without inventing ratings or hiding provisional comparisons. */
export function Profile({ view, comparison, rematchHref, roleSwapHref }: ProfileProps) {
  return (
    <main className="profile" aria-labelledby="profile-title">
      <header className="profile__hero">
        <div>
          <span className="profile__eyebrow">WHALE ARENA · PROFILE</span>
          <h1 id="profile-title">Your current beneath the surface.</h1>
          <p>UTC streaks, saved results, and cosmetic milestones from finalized games.</p>
        </div>
        <div className="profile__streak" aria-label={`${view.currentStreak} day current streak`}>
          <strong>{view.currentStreak}</strong>
          <span>day streak</span>
          <small>Best {view.bestStreak}</small>
        </div>
      </header>

      <section className="profile__section" aria-labelledby="profile-badges-title">
        <div className="profile__section-heading">
          <div>
            <span className="profile__eyebrow">COSMETIC MILESTONES</span>
            <h2 id="profile-badges-title">Badges</h2>
          </div>
          <span className="profile__count">{view.badges.length}</span>
        </div>
        <div className="profile__badges">
          {view.badges.length ? (
            view.badges.map((badge) => (
              <article className="profile__badge" key={badge.badgeId}>
                <span aria-hidden="true">✦</span>
                <div>
                  <strong>{badge.title}</strong>
                  <p>{badge.description}</p>
                </div>
              </article>
            ))
          ) : (
            <p className="profile__empty">Finish a finalized run to light your first marker.</p>
          )}
        </div>
      </section>

      <div className="profile__columns">
        <section className="profile__section" aria-labelledby="profile-daily-title">
          <div className="profile__section-heading">
            <div>
              <span className="profile__eyebrow">DAILY FIVE</span>
              <h2 id="profile-daily-title">History</h2>
            </div>
            <span className="profile__count">{view.dailyHistory.length}</span>
          </div>
          {view.dailyHistory.length ? (
            <ol className="profile__history">
              {view.dailyHistory.map((entry) => (
                <li key={entry.attemptId}>
                  <span>{entry.completedAt.slice(0, 10)}</span>
                  <strong>${entry.equity}</strong>
                  <small>{signed(entry.returnPct)}</small>
                </li>
              ))}
            </ol>
          ) : (
            <p className="profile__empty">No official Daily Five result is saved yet.</p>
          )}
          {comparison && (
            <div className="profile__comparison" aria-live="polite">
              <strong>
                {comparison.rank === null ? 'No rank in this scope' : `Rank ${comparison.rank}`}
              </strong>
              <span>
                {comparison.eligibleAttempts} eligible attempts
                {comparison.percentile === null
                  ? ' · provisional'
                  : ` · ${comparison.percentile}th percentile`}
              </span>
              <p>{comparison.note}</p>
            </div>
          )}
        </section>

        <section className="profile__section" aria-labelledby="profile-hunt-title">
          <div className="profile__section-heading">
            <div>
              <span className="profile__eyebrow">WHALE HUNT</span>
              <h2 id="profile-hunt-title">Role history</h2>
            </div>
            <span className="profile__count">{view.huntHistory.length}</span>
          </div>
          {view.huntHistory.length ? (
            <ol className="profile__history">
              {view.huntHistory.map((entry) => (
                <li key={`${entry.matchId}-${entry.role}`}>
                  <span>{entry.completedAt.slice(0, 10)}</span>
                  <strong>{displayRole(entry.role)}</strong>
                  <small className={entry.won ? 'profile__win' : 'profile__loss'}>
                    {entry.won ? 'Won' : 'Lost'} · {entry.matchKind ?? 'human'}
                  </small>
                </li>
              ))}
            </ol>
          ) : (
            <p className="profile__empty">No finalized Hunt match is saved yet.</p>
          )}
          {(rematchHref || roleSwapHref) && (
            <div className="profile__links" aria-label="Hunt links">
              {rematchHref && <a href={rematchHref}>Rematch</a>}
              {roleSwapHref && <a href={roleSwapHref}>Swap roles</a>}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
