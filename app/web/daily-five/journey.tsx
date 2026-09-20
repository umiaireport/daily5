import { useEffect, useRef, useState } from 'react';
import type {
  DailyAttemptView,
  DailyFivePublic,
  DailyFiveTransport,
} from '../../shared/daily-five.js';
import {
  commandKey,
  DAILY_REQUEST_TIMEOUT_MS,
  DailyFiveTransportError,
  withDailyDeadline,
} from '../api/daily-five.js';

const DEFAULT_STORAGE_KEY = 'daily5.daily-five.attempt';
interface StoredAttempt {
  dailyId: string;
  attemptId: string;
  startKey: string;
  mode: 'official' | 'practice';
}
export interface DailyOperation {
  label: string;
  deadline: number;
}

function readStoredAttempt(storageKey: string): StoredAttempt | null {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
    return value &&
      typeof value.dailyId === 'string' &&
      typeof value.attemptId === 'string' &&
      typeof value.startKey === 'string' &&
      ['official', 'practice'].includes(value.mode)
      ? value
      : null;
  } catch {
    return null;
  }
}

function writeStoredAttempt(value: StoredAttempt, storageKey: string): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    /* Server still owns the saved attempt. */
  }
}

export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  if (/\bround not found\b/i.test(message))
    return 'Your saved Daily Five is being restored. Please try again.';
  return message || 'The connection slipped. Reconnect to check your saved attempt.';
}

/** Reject unusable states explicitly instead of rendering an empty page. */
export function requirePlayableAttempt(view: DailyAttemptView): DailyAttemptView {
  if (view.phase === 'final-result' && view.finalResult) return view;
  if (
    (view.phase === 'round-open' || view.phase === 'saved-result') &&
    view.round?.candidates.length &&
    (view.phase !== 'saved-result' || view.savedResult)
  )
    return view;
  throw new DailyFiveTransportError(
    'Today’s Daily Five could not be restored. Try again or open a new attempt for today.',
    404,
  );
}

/** Restores authoritative state, retains start keys, and serializes bounded commands. */
export function useDailyFiveJourney(
  transport: DailyFiveTransport,
  storageKey = DEFAULT_STORAGE_KEY,
) {
  const [daily, setDaily] = useState<DailyFivePublic | null>(null);
  const [attempt, setAttempt] = useState<DailyAttemptView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [operation, setOperation] = useState<DailyOperation | null>(null);
  const [retry, setRetry] = useState(0);
  const [missing, setMissing] = useState(false);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const locked = useRef(false);
  const generation = useRef(0);
  const stored = useRef<StoredAttempt | null>(null);

  async function request<T>(label: string, task: () => Promise<T>, version: number): Promise<T> {
    if (version !== generation.current) throw new Error('This request was superseded.');
    setOperation({ label, deadline: Date.now() + DAILY_REQUEST_TIMEOUT_MS });
    return withDailyDeadline(task);
  }

  function report(error: unknown) {
    setError(errorMessage(error));
    setMissing(error instanceof DailyFiveTransportError && [401, 403, 404].includes(error.status));
  }

  useEffect(() => {
    const version = ++generation.current;
    locked.current = true;
    async function load() {
      setLoading(true);
      setError('');
      setStatus('');
      try {
        const challenge = await request(
          retry ? 'Reconnecting to today’s challenge' : 'Loading the saved historical case',
          () => transport.getToday(),
          version,
        );
        if (version !== generation.current) return;
        setDaily(challenge);
        stored.current ??= readStoredAttempt(storageKey);
        let record = stored.current;
        // A Daily Five attempt is scoped to one published day. Never try to
        // resume yesterday's id against today's case pack; that was the source
        // of the misleading empty-round screen on the landing page.
        if (record?.dailyId !== challenge.dailyId) {
          record = {
            dailyId: challenge.dailyId,
            attemptId: '',
            startKey: commandKey('start'),
            mode: 'official',
          };
          stored.current = record;
          writeStoredAttempt(record, storageKey);
        }
        let view: DailyAttemptView;
        if (record?.attemptId) {
          view = await request(
            'Restoring your saved round',
            () => transport.resume({ attemptId: record!.attemptId }),
            version,
          );
        } else {
          writeStoredAttempt(record!, storageKey);
          const started = await request(
            'Opening today’s attempt',
            () => transport.start({ idempotencyKey: record!.startKey }),
            version,
          );
          if (version !== generation.current) return;
          record = { ...record!, attemptId: started.attemptId, mode: started.mode ?? record!.mode };
          stored.current = record;
          writeStoredAttempt(record, storageKey);
          // A replayed start command may return an older snapshot; always resume it.
          view = await request(
            'Checking your latest saved progress',
            () => transport.resume({ attemptId: started.attemptId }),
            version,
          );
        }
        if (version !== generation.current) return;
        setAttempt(requirePlayableAttempt(view));
        setMissing(false);
        setNeedsReconnect(false);
        setError('');
        if (retry) setStatus('Connected. Your latest saved progress is ready.');
      } catch (error) {
        if (version === generation.current) {
          report(error);
          setNeedsReconnect(true);
        }
      } finally {
        if (version === generation.current) {
          setLoading(false);
          setOperation(null);
          locked.current = false;
        }
      }
    }
    void load();
    return () => {
      generation.current++;
    };
  }, [transport, retry, storageKey]);

  function reconnect() {
    if (locked.current) return;
    locked.current = true;
    setRetry((value) => value + 1);
  }

  function startFresh() {
    if (!daily || locked.current) return;
    stored.current = {
      dailyId: daily.dailyId,
      attemptId: '',
      startKey: commandKey('recovery-start'),
      mode: 'practice',
    };
    writeStoredAttempt(stored.current, storageKey);
    setAttempt(null);
    reconnect();
  }

  async function act(
    label: string,
    task: () => Promise<DailyAttemptView>,
  ): Promise<DailyAttemptView | null> {
    if (locked.current || needsReconnect || !attempt) return null;
    locked.current = true;
    setError('');
    setStatus('');
    const version = generation.current;
    try {
      const updated = requirePlayableAttempt(await request(label, task, version));
      if (version !== generation.current) return null;
      setAttempt(updated);
      return updated;
    } catch (error) {
      if (version !== generation.current) return null;
      report(error);
      try {
        const recovered = requirePlayableAttempt(
          await request(
            'Checking whether your action was saved',
            () => transport.resume({ attemptId: attempt.attemptId }),
            version,
          ),
        );
        if (version !== generation.current) return null;
        setAttempt(recovered);
        setMissing(false);
        setNeedsReconnect(false);
        setError('');
        setStatus(
          'Connection restored. Showing the latest saved state; review it before trying again.',
        );
        return recovered;
      } catch (resumeError) {
        if (version === generation.current) {
          report(resumeError);
          setNeedsReconnect(true);
        }
      }
      return null;
    } finally {
      if (version === generation.current) {
        setOperation(null);
        locked.current = false;
      }
    }
  }

  return {
    daily,
    attempt,
    mode: attempt?.mode ?? stored.current?.mode ?? 'official',
    loading,
    error,
    status,
    setStatus,
    operation,
    busy: !!operation || loading,
    missing,
    needsReconnect,
    reconnect,
    startFresh,
    act,
  };
}

/** Keeps countdown updates local so charts do not rerender each second. */
export function RequestProgress({ operation }: { operation: DailyOperation | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!operation) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [operation]);
  if (!operation) return null;
  return (
    <div className="daily-five__request" role="status">
      <span>{operation.label}…</span>
      <span role="timer" aria-live="off">
        Timeout in {Math.max(0, Math.min(15, Math.ceil((operation.deadline - now) / 1000)))}s
      </span>
    </div>
  );
}
