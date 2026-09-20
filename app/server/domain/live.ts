import { z } from 'zod';
import type { Operation, Schema } from '../nansen/client.js';

/** Minimal provider adapter used to select the current Daily5 asset universe. */
const numberLike = z.union([z.number(), z.string()]).nullable().optional();
const tokenRowSchema = z
  .object({
    chain: z.string(),
    token_address: z.string(),
    token_symbol: z.string().nullable().optional(),
    token_name: z.string().nullable().optional(),
    price_usd: numberLike,
    liquidity: numberLike,
    volume: numberLike,
    netflow: numberLike,
  })
  .passthrough();
const screenerSchema = z
  .object({ data: z.array(tokenRowSchema), pagination: z.unknown().optional() })
  .passthrough();

type TokenRow = z.infer<typeof tokenRowSchema>;

export interface LiveNansenClient {
  request<T>(
    operation: Operation,
    body: unknown,
    requestSchema: Schema<unknown>,
    responseSchema: Schema<T>,
  ): Promise<{ data: T; cached: boolean }>;
}

export class LiveCollectionError extends Error {
  constructor(message = 'Nansen did not return enough usable Daily5 assets.') {
    super(message);
    this.name = 'LiveCollectionError';
  }
}

const requestSchema: Schema<unknown> = { parse: (input) => input };
const screenerResponse: Schema<z.infer<typeof screenerSchema>> = screenerSchema;

function asNumber(value: unknown, fallback = 0): number {
  const number =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) ? number : fallback;
}

function compact(value: string | null | undefined, fallback: string): string {
  const cleaned = value?.replace(/\s+/g, ' ').trim();
  return cleaned ? cleaned.slice(0, 32) : fallback;
}

function shortAddress(value: string): string {
  return value.length > 10 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

function stableSymbol(symbol: string): boolean {
  return /^(?:USDC|USDT|DAI|USDE|USDS|FRAX|USDY|TUSD)$/i.test(symbol.trim());
}

function candidateScore(row: TokenRow): number {
  return (
    Math.log10(1 + Math.max(0, asNumber(row.liquidity))) +
    Math.log10(1 + Math.max(0, asNumber(row.volume))) +
    Math.log10(1 + Math.abs(asNumber(row.netflow)))
  );
}

function normalizeCandidates(rows: TokenRow[], limit = 25): TokenRow[] {
  const seen = new Set<string>();
  return rows
    .filter((row) => {
      const symbol = compact(row.token_symbol, '');
      if (
        !row.chain ||
        !row.token_address ||
        asNumber(row.price_usd) <= 0 ||
        asNumber(row.liquidity) <= 0 ||
        stableSymbol(symbol)
      )
        return false;
      const key = `${row.chain.toLowerCase()}:${row.token_address.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => candidateScore(b) - candidateScore(a))
    .slice(0, limit);
}

export interface LiveProviderAsset {
  readonly symbol: string;
  readonly name: string;
  readonly chain: string;
  readonly address: string;
}

/** Returns 25 provider-ranked assets used to build the current Daily5 board. */
export async function discoverLiveProviderAssets(
  client: LiveNansenClient,
): Promise<readonly LiveProviderAsset[]> {
  const response = await client.request(
    'liveCandidates',
    {
      chains: ['ethereum', 'solana', 'base', 'arbitrum', 'polygon'],
      timeframe: '24h',
      pagination: { page: 1, per_page: 100 },
      filters: {},
      order_by: [{ field: 'netflow', direction: 'DESC' }],
    },
    requestSchema,
    screenerResponse,
  );
  const candidates = normalizeCandidates(response.data.data);
  if (candidates.length < 25)
    throw new LiveCollectionError(
      `Nansen returned ${candidates.length} usable assets; 25 are required for Daily5.`,
    );
  return candidates.map((candidate) => ({
    symbol: compact(candidate.token_symbol, shortAddress(candidate.token_address)),
    name: compact(
      candidate.token_name ?? candidate.token_symbol,
      shortAddress(candidate.token_address),
    ),
    chain: candidate.chain,
    address: candidate.token_address,
  }));
}
