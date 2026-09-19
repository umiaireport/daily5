import type { ProgressionView, ShareResult } from '../../shared/progression.js';

export interface ProgressionApiOptions {
  readonly basePath?: string;
  readonly fetcher?: typeof fetch;
  readonly timeoutMs?: number;
}

export class ProgressionApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ProgressionApiError';
    this.status = status;
  }
}

/** Browser transport for the progression profile and public share routes. */
export function createProgressionApi(options: ProgressionApiOptions = {}) {
  const basePath = (options.basePath ?? '/api').replace(/\/$/, '');
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const timeoutMs = options.timeoutMs ?? 15_000;

  async function request<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetcher(`${basePath}${path}`, {
        credentials: 'same-origin',
        signal: controller.signal,
      });
      const text = await response.text();
      const payload = text ? (JSON.parse(text) as unknown) : null;
      if (!response.ok) {
        const message =
          payload && typeof payload === 'object' && 'message' in payload
            ? String((payload as { message: unknown }).message)
            : 'The progression connection slipped. Please try again.';
        throw new ProgressionApiError(message, response.status);
      }
      return payload as T;
    } catch (error) {
      if (error instanceof ProgressionApiError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError')
        throw new ProgressionApiError('The progression request timed out. Please try again.', 408);
      throw new ProgressionApiError(
        error instanceof Error ? error.message : 'The progression connection slipped.',
        0,
      );
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  return {
    history: () => request<ProgressionView>('/progression'),
    share: (shareId: string) => request<ShareResult>(`/shares/${encodeURIComponent(shareId)}`),
  };
}

export const progressionApi = createProgressionApi();
