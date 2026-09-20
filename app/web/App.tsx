import { FormEvent, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { createDailyFiveApi, type DailyFiveApi, type DailyLeaderboard } from './api/daily-five';
import { DailyFiveScreen } from './daily-five';
import { DailyMark, Icon } from './components/Visuals';

type View = 'daily' | 'practice' | 'leaderboards' | 'account' | 'how';

interface User {
  readonly username: string;
  readonly displayName: string;
}

interface ResultEntry {
  readonly rank: number;
  readonly attemptId: string;
  readonly dailyId?: string;
  readonly completedAt?: string;
  readonly name?: string;
  readonly equity: string;
  readonly returnPct: string;
}

const LEADERBOARD_WINDOW = 21;

function leaderboardWindow(
  entries: readonly ResultEntry[],
  viewerRank?: number,
): readonly ResultEntry[] {
  if (entries.length <= LEADERBOARD_WINDOW) return entries;
  if (!viewerRank || viewerRank <= 10) return entries.slice(0, LEADERBOARD_WINDOW);

  // Keep the top ten visible, then place the signed-in player in a five-above/
  // five-below window. The final fill keeps the viewport at exactly 21 rows
  // when the player is close to the top ten or the bottom of the board.
  const nearby = entries.slice(Math.max(10, viewerRank - 6), viewerRank + 5);
  return [...entries.slice(0, 10), ...nearby, ...entries]
    .filter(
      (entry, index, all) =>
        all.findIndex((candidate) => candidate.attemptId === entry.attemptId) === index,
    )
    .slice(0, LEADERBOARD_WINDOW);
}

function viewFromHash(): View {
  const hash = window.location.hash.slice(1);
  return hash === 'practice' || hash === 'leaderboards' || hash === 'account' || hash === 'how'
    ? hash
    : 'daily';
}

function money(value: string): string {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? `$${parsed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : value;
}

function signedPercent(value: string): string {
  return `${value.startsWith('-') ? '' : '+'}${value}%`;
}

function dateLabel(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function Login({ onLogin }: { onLogin: (user: User) => void }) {
  const [registering, setRegistering] = useState(false);
  const [username, setUsername] = useState('demo');
  const [password, setPassword] = useState('demo');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const user = await api<User>(registering ? '/auth/register' : '/auth/login', {
        username,
        password,
        ...(registering ? { displayName } : {}),
      });
      onLogin(user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to log in.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="daily5-login-shell">
      <section className="daily5-login-card">
        <div className="daily5-brand daily5-brand--large">
          <DailyMark />
          <span>
            DAILY<span>5</span>
            <small>FIVE ROUNDS · ONE EDGE</small>
          </span>
        </div>
        <p className="daily5-kicker">A five-round market-reading challenge</p>
        <h1>
          Read the move.
          <br />
          Own the score.
        </h1>
        <p className="daily5-login-copy">
          Create your trader profile, study the evidence, allocate your virtual wallet, and see
          whether your read can beat the board. Finish strong, climb the rankings, and share your
          score.
        </p>
        <form onSubmit={submit} className="daily5-login-form">
          <label>
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={registering ? 8 : undefined}
              autoComplete={registering ? 'new-password' : 'current-password'}
            />
          </label>
          {registering && (
            <label>
              Display name <span className="daily5-muted">(optional)</span>
              <input
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder={username || 'How you appear on the board'}
                autoComplete="nickname"
              />
            </label>
          )}
          {error && (
            <p className="daily5-error" role="alert">
              {error}
            </p>
          )}
          <button className="daily5-button daily5-button--primary" disabled={busy}>
            {busy ? 'Opening the board…' : registering ? 'Create account' : 'Enter the board'}{' '}
            <Icon name="arrow" size={16} />
          </button>
        </form>
        <p className="daily5-demo-note">
          {registering ? (
            <>
              Already have an account?{' '}
              <button
                type="button"
                className="daily5-inline-button"
                onClick={() => setRegistering(false)}
              >
                Log in
              </button>
            </>
          ) : (
            <>
              New here?{' '}
              <button
                type="button"
                className="daily5-inline-button"
                onClick={() => setRegistering(true)}
              >
                Create an account
              </button>{' '}
              · Demo: <code>demo</code> / <code>demo</code>
            </>
          )}
        </p>
      </section>
    </div>
  );
}

function LeaderboardTable({ entries, empty }: { entries: readonly ResultEntry[]; empty: string }) {
  if (!entries.length) return <p className="daily5-muted">{empty}</p>;
  return (
    <div className="daily5-record-table daily5-record-table--viewport" role="table">
      <div className="daily5-record-row daily5-record-row--head" role="row">
        <span>RANK</span>
        <span>PLAYER</span>
        <span>DAY</span>
        <span>WALLET</span>
        <span>RETURN</span>
      </div>
      {entries.map((entry) => (
        <div className="daily5-record-row" role="row" key={`${entry.dailyId}-${entry.attemptId}`}>
          <strong>#{entry.rank}</strong>
          <span>{entry.name ?? 'demo'}</span>
          <span>{dateLabel(entry.completedAt || entry.dailyId || '—')}</span>
          <b>{money(entry.equity)}</b>
          <em className={entry.returnPct.startsWith('-') ? 'is-negative' : 'is-positive'}>
            {signedPercent(entry.returnPct)}
          </em>
        </div>
      ))}
    </div>
  );
}

function HowToPlay() {
  return (
    <section className="daily5-page-card daily5-howto">
      <span className="daily-five__eyebrow">HOW TO PLAY</span>
      <h1>Read the board. Beat the noise.</h1>
      <p className="daily5-page-lede">
        Daily5 is a five-round market-reading challenge. Find the signal, make the call, and prove
        your instincts without real money or a wallet connection.
      </p>
      <div className="daily5-step-grid">
        <article>
          <b>01</b>
          <h2>Spot the signal</h2>
          <p>Compare five assets and find the setup with the clearest edge.</p>
        </article>
        <article>
          <b>02</b>
          <h2>Buy better information</h2>
          <p>Spend three clue credits where your conviction still needs proof.</p>
        </article>
        <article>
          <b>03</b>
          <h2>Make the call</h2>
          <p>
            Size your positions, choose your leverage, and keep the rest in cash if the read is not
            there.
          </p>
        </article>
        <article>
          <b>04</b>
          <h2>Climb the board</h2>
          <p>Lock your read, learn the result, and show your friends how you trade.</p>
        </article>
      </div>
      <div className="daily5-howto-callout">
        <strong>Daily challenge</strong>
        <span>Five rounds. One score. A fresh chance to show the leaderboard what you saw.</span>
      </div>
      <div className="daily5-howto-callout">
        <strong>Practice Arena</strong>
        <span>
          Try fresh boards, refine your timing, and keep practice off the official record.
        </span>
      </div>
    </section>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView] = useState<View>(viewFromHash);
  const [practiceNonce, setPracticeNonce] = useState(0);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<readonly ResultEntry[]>([]);
  const [allTime, setAllTime] = useState<readonly ResultEntry[]>([]);
  const [dailyLeaderboard, setDailyLeaderboard] = useState<DailyLeaderboard | null>(null);
  const [leaderboardTab, setLeaderboardTab] = useState<'today' | 'all-time'>('today');
  const [recordsLoading, setRecordsLoading] = useState(false);
  const practiceApi = useMemo<DailyFiveApi>(
    () => createDailyFiveApi({ routePrefix: '/practice', startMode: 'practice' }),
    [],
  );
  const dailyApi = useMemo<DailyFiveApi>(() => createDailyFiveApi(), []);

  useEffect(() => {
    void api<User>('/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, []);

  function navigate(next: View) {
    if (next === 'practice') setPracticeNonce((value) => value + 1);
    setView(next);
    window.location.hash = next;
    setError('');
  }

  async function loadRecords() {
    setRecordsLoading(true);
    setError('');
    try {
      const [historyResponse, allTimeResponse, today] = await Promise.all([
        api<{ entries: ResultEntry[] }>('/account/history'),
        api<{ entries: ResultEntry[] }>('/leaderboards/all-time'),
        dailyApi.getToday(),
      ]);
      setHistory(historyResponse.entries);
      setAllTime(allTimeResponse.entries);
      setDailyLeaderboard(await dailyApi.leaderboard(today.dailyId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Records could not be loaded.');
    } finally {
      setRecordsLoading(false);
    }
  }

  useEffect(() => {
    if (user && (view === 'leaderboards' || view === 'account')) void loadRecords();
  }, [user, view]);

  async function logout() {
    await api('/auth/logout', {});
    setUser(null);
  }

  if (authLoading) return <div className="daily5-loading">Setting the board…</div>;
  if (!user) return <Login onLogin={(next) => setUser(next)} />;

  return (
    <div className="daily5-shell">
      <header className="daily5-header">
        <button className="daily5-brand" onClick={() => navigate('daily')} aria-label="Daily5 home">
          <DailyMark />
          <span>
            DAILY<span>5</span>
            <small>FIVE ROUNDS · ONE EDGE</small>
          </span>
        </button>
        <nav className="daily5-nav" aria-label="Main navigation">
          <button className={view === 'daily' ? 'active' : ''} onClick={() => navigate('daily')}>
            Daily challenge
          </button>
          <button
            className={view === 'practice' ? 'active' : ''}
            onClick={() => navigate('practice')}
          >
            Practice Arena
          </button>
          <button
            className={view === 'leaderboards' ? 'active' : ''}
            onClick={() => navigate('leaderboards')}
          >
            Leaderboards
          </button>
          <button
            className={view === 'account' ? 'active' : ''}
            onClick={() => navigate('account')}
          >
            Account
          </button>
        </nav>
        <button className="daily5-help-link" onClick={() => navigate('how')}>
          <Icon name="help" size={15} /> How to play
        </button>
      </header>

      <div className="daily5-context-bar">
        <span>
          <i className="daily5-status-dot" /> Logged in as <strong>{user.displayName}</strong>
        </span>
        <button onClick={() => void logout()}>Log out</button>
      </div>

      {error && (
        <div className="daily5-global-error" role="alert">
          {error}
        </div>
      )}

      {view === 'daily' && (
        <>
          <section className="daily5-hero">
            <div>
              <span className="daily-five__eyebrow">
                THE DAILY BOARD ·{' '}
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
              <h1>
                Five rounds.
                <br />
                <em>One market edge.</em>
              </h1>
              <p>
                The board is set. Find the signal, make your call, and see who reads the market
                best. Share the result when the final round settles.
              </p>
            </div>
            <div className="daily5-hero-mark" aria-hidden="true">
              <DailyMark large />
            </div>
          </section>
          <DailyFiveScreen
            key="official"
            transport={dailyApi}
            storageKey="daily5.official.attempt"
            showLeaderboard
            dailyNumber="TODAY"
            loadLeaderboard={dailyApi.leaderboard}
          />
        </>
      )}

      {view === 'practice' && (
        <>
          <section className="daily5-hero daily5-hero--practice">
            <div>
              <span className="daily-five__eyebrow">PRACTICE ARENA · FRESH BOARD</span>
              <h1>
                Sharpen your read.
                <br />
                <em>Make another call.</em>
              </h1>
              <p>
                Test your instincts on a fresh five-asset board, then put your best read on the
                official record when you are ready.
              </p>
            </div>
            <div className="daily5-practice-badge">
              1<br />
              <small>ROUND</small>
            </div>
          </section>
          <DailyFiveScreen
            key={`practice-${practiceNonce}`}
            transport={practiceApi}
            storageKey={`daily5.practice.${practiceNonce}`}
            showLeaderboard={false}
            dailyNumber="PRACTICE"
            onPracticeAgain={() => setPracticeNonce((value) => value + 1)}
          />
        </>
      )}

      {view === 'leaderboards' && (
        <section className="daily5-page-card daily5-records">
          <div className="daily5-page-heading">
            <div>
              <span className="daily-five__eyebrow">THE RECORDS</span>
              <h1>Make your mark.</h1>
              <p>Official scores only. Practice boards never enter the standings.</p>
            </div>
            <button className="daily5-button" onClick={() => void loadRecords()}>
              Refresh
            </button>
          </div>
          {recordsLoading ? (
            <p className="daily5-muted">Loading the frozen record…</p>
          ) : (
            <>
              <div className="daily5-record-tabs" role="tablist" aria-label="Leaderboard views">
                <button
                  type="button"
                  role="tab"
                  aria-selected={leaderboardTab === 'today'}
                  className={leaderboardTab === 'today' ? 'is-active' : ''}
                  onClick={() => setLeaderboardTab('today')}
                >
                  Today’s leaderboard
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={leaderboardTab === 'all-time'}
                  className={leaderboardTab === 'all-time' ? 'is-active' : ''}
                  onClick={() => setLeaderboardTab('all-time')}
                >
                  All-time leaderboard
                </button>
              </div>
              {leaderboardTab === 'today' ? (
                <section role="tabpanel" aria-label="Today’s leaderboard">
                  <div className="daily5-record-heading">
                    <h2>Today’s leaderboard</h2>
                    <small>
                      {dailyLeaderboard?.locked ? 'Historical board' : 'Live until UTC reset'}
                    </small>
                  </div>
                  <p className="daily5-record-note">
                    Top 10 plus five scores above and below your completed rank.
                  </p>
                  <LeaderboardTable
                    entries={leaderboardWindow(
                      dailyLeaderboard?.entries ?? [],
                      dailyLeaderboard?.viewerRank,
                    )}
                    empty="No official scores have been posted today."
                  />
                </section>
              ) : (
                <section role="tabpanel" aria-label="All-time leaderboard">
                  <div className="daily5-record-heading">
                    <h2>All-time leaderboard</h2>
                    <small>Top 100</small>
                  </div>
                  <p className="daily5-record-note">
                    Scroll the same 21-row window to explore all 100 scores.
                  </p>
                  <LeaderboardTable
                    entries={allTime}
                    empty="Complete an official Daily5 to start the all-time record."
                  />
                </section>
              )}
            </>
          )}
        </section>
      )}

      {view === 'account' && (
        <section className="daily5-page-card daily5-records">
          <div className="daily5-page-heading">
            <div>
              <span className="daily-five__eyebrow">YOUR ACCOUNT · {user.displayName}</span>
              <h1>Your saved results.</h1>
              <p>Your official Daily5 history stays available after each day’s board freezes.</p>
            </div>
          </div>
          {recordsLoading ? (
            <p className="daily5-muted">Loading your history…</p>
          ) : (
            <>
              <h2>Earlier official results</h2>
              <LeaderboardTable
                entries={history}
                empty="Your first completed Daily5 will appear here."
              />
              <div className="daily5-history-note">
                <strong>Practice stays private</strong>
                <span>
                  Your one-round practice games help you learn the interface but do not affect your
                  history, today’s leaderboard, or the all-time top 100.
                </span>
              </div>
            </>
          )}
        </section>
      )}

      {view === 'how' && <HowToPlay />}

      <footer className="daily5-footer">
        <span>DAILY5 · READ THE MARKET. MAKE YOUR CALL.</span>
        <span>
          <i className="daily5-status-dot" />{' '}
          {view === 'practice' ? 'PRACTICE MODE' : 'NANSEN-READY DATA MODE'}
        </span>
      </footer>
    </div>
  );
}
