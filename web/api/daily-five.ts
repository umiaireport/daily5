import type {
  ContinueDailyCommand,
  DailyAttemptView,
  DailyFivePublic,
  DailyFiveTransport,
  StartDailyFiveCommand,
  SubmitDailyDecisionCommand,
  UnlockDailyClueCommand,
} from '../../shared/daily-five.js';
import type { ApiError } from '../../shared/game-rules.js';

export const DAILY_REQUEST_TIMEOUT_MS = 15_000;

/** Bounds both response headers and body, even when a transport ignores AbortSignal. */
export async function withDailyDeadline<T>(
  task: () => Promise<T>,
  timeoutMs = DAILY_REQUEST_TIMEOUT_MS,
  onTimeout?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(
            new DailyFiveTransportError(
              'The request timed out. Reconnect to check whether your action was saved.',
              408,
            ),
          );
          onTimeout?.();
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export interface DailyFiveApiOptions {
  readonly basePath?: string;
  readonly routePrefix?: string;
  readonly startMode?: 'official' | 'practice';
  readonly fetcher?: typeof fetch;
  readonly timeoutMs?: number;
  readonly createIdempotencyKey?: (operation: string) => string;
}

export class DailyFiveTransportError extends Error {
  readonly status: number;
  readonly apiError: ApiError | null;

  constructor(message: string, status: number, apiError: ApiError | null = null) {
    super(message);
    this.name = 'DailyFiveTransportError';
    this.status = status;
    this.apiError = apiError;
  }
}

export interface DailyLeaderboardEntry {
  readonly rank: number;
  readonly attemptId: string;
  readonly name?: string;
  readonly dailyId?: string;
  readonly completedAt?: string;
  readonly equity: string;
  readonly returnPct: string;
  readonly cohort: string;
}

export interface DailyLeaderboard {
  readonly dailyId: string;
  readonly cohort: string;
  readonly locked?: boolean;
  readonly entries: readonly DailyLeaderboardEntry[];
  readonly viewerRank?: number;
}

export interface DailyFiveApi extends DailyFiveTransport {
  leaderboard(dailyId: string): Promise<DailyLeaderboard>;
}

function defaultIdempotencyKey(operation: string): string {
  const random = globalThis.crypto?.randomUUID?.();
  return `daily-five-${operation}-${random ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function encode(value: string): string {
  return encodeURIComponent(value);
}

function withIdempotencyKey<T extends { readonly idempotencyKey: string }>(
  command: T,
  operation: string,
  createKey: (operation: string) => string,
): T {
  return command.idempotencyKey.length > 0
    ? command
    : { ...command, idempotencyKey: createKey(operation) };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

/** Creates a browser transport for the server-owned Daily Five routes. */
export function createDailyFiveApi(options: DailyFiveApiOptions = {}): DailyFiveApi {
  const basePath = (options.basePath ?? '/api').replace(/\/$/, '');
  const routePrefix = (options.routePrefix ?? '/daily-five').replace(/\/$/, '');
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? DAILY_REQUEST_TIMEOUT_MS;
  const createKey = options.createIdempotencyKey ?? defaultIdempotencyKey;
  let todayDailyId: string | null = null;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    try {
      return await withDailyDeadline(
        async () => {
          const response = await fetcher(`${basePath}${path}`, {
            ...init,
            credentials: 'same-origin',
            signal: controller.signal,
            headers: {
              ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
              ...init.headers,
            },
          });
          const data = await readJson(response);
          if (!response.ok) {
            const apiError =
              data && typeof data === 'object' && 'code' in data && 'message' in data
                ? (data as ApiError)
                : null;
            throw new DailyFiveTransportError(
              apiError?.message ??
                (data &&
                typeof data === 'object' &&
                'message' in data &&
                typeof data.message === 'string'
                  ? data.message
                  : 'The Daily Five connection slipped. Please try again.'),
              response.status,
              apiError,
            );
          }
          return data as T;
        },
        timeoutMs,
        () => controller.abort(),
      );
    } catch (error) {
      if (error instanceof DailyFiveTransportError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError')
        throw new DailyFiveTransportError(
          'The Daily Five request timed out. Please try again.',
          408,
        );
      throw new DailyFiveTransportError(
        error instanceof Error
          ? error.message
          : 'The Daily Five connection slipped. Please try again.',
        0,
      );
    }
  }

  function post<T>(path: string, body: unknown): Promise<T> {
    return request<T>(path, { method: 'POST', body: JSON.stringify(body) });
  }

  return {
    getToday: async () => {
      const challenge = await request<DailyFivePublic>(`${routePrefix}/today`);
      todayDailyId = challenge.dailyId;
      return challenge;
    },
    start: (command: StartDailyFiveCommand) => {
      if (!todayDailyId)
        throw new DailyFiveTransportError('Load today’s Daily Five before starting.', 0);
      return post<DailyAttemptView>(
        `${routePrefix}/${encode(todayDailyId)}/attempts`,
        withIdempotencyKey(
          options.startMode ? { ...command, mode: options.startMode } : command,
          'start',
          createKey,
        ),
      );
    },
    resume: (command) =>
      request<DailyAttemptView>(`${routePrefix}/attempts/${encode(command.attemptId)}`),
    unlock: (attemptId: string, command: UnlockDailyClueCommand) =>
      post<DailyAttemptView>(
        `${routePrefix}/attempts/${encode(attemptId)}/clues`,
        withIdempotencyKey(command, 'unlock-clue', createKey),
      ),
    submit: (attemptId: string, command: SubmitDailyDecisionCommand) =>
      post<DailyAttemptView>(
        `${routePrefix}/attempts/${encode(attemptId)}/tickets`,
        withIdempotencyKey(command, 'submit-ticket', createKey),
      ),
    continue: (attemptId: string, command: ContinueDailyCommand) =>
      post<DailyAttemptView>(
        `${routePrefix}/attempts/${encode(attemptId)}/continue`,
        withIdempotencyKey(command, 'continue', createKey),
      ),
    leaderboard: (dailyId: string) =>
      request<DailyLeaderboard>(`${routePrefix}/${encode(dailyId)}/leaderboard`),
  };
}

/** Creates a stable command key for a user action while keeping retries idempotent. */
export function commandKey(
  operation: string,
  createKey: (operation: string) => string = defaultIdempotencyKey,
): string {
  return createKey(operation);
}

export const dailyFiveApi = createDailyFiveApi();
