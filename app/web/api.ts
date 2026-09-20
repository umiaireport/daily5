function parseResponse(text: string, response: Response): { message?: string } | null {
  if (!text) return null;
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('json'))
    return {
      message:
        /the page|<html/i.test(text) || response.status === 401
          ? 'The server returned a web page instead of the Daily5 API. Check that the API is running, then reload.'
          : 'The Daily5 server returned an unexpected response. Please reload.',
    };
  try {
    return JSON.parse(text) as { message?: string };
  } catch {
    return { message: 'The Daily5 server returned invalid data. Please reload.' };
  }
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    signal: AbortSignal.timeout(15_000),
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  const data = parseResponse(text, response);
  if (!response.ok) throw new Error(data?.message || 'The connection slipped. Please try again.');
  if (!data) throw new Error('The Daily5 server returned an empty response. Please reload.');
  return data as T;
}
