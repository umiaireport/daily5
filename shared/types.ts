export type CardKind = 'flow' | 'buyers' | 'pulse';
export type RoundMode = 'synthetic' | 'live';
export type Weights = [number, number, number, number];
export interface Clue {
  kind: CardKind;
  title: string;
  headline: string;
  detail: string;
  metrics: { label: string; value: string }[];
  warning: string;
  observedAt: string;
}
export interface Asset {
  id: string;
  alias: string;
  category: string;
  series: number[];
  clues: Partial<Record<CardKind, Clue>>;
}
export interface Round {
  id: string;
  index: number;
  total: number;
  title: string;
  subtitle: string;
  mode: RoundMode;
  sourceLabel?: string;
  sourceUrl?: string;
  cutoff: string;
  assets: Asset[];
  unlocksRemaining: number;
  locked: boolean;
  weights: Weights | null;
}
export interface AssetResult {
  id: string;
  alias: string;
  name: string;
  symbol: string;
  entryPrice: number;
  exitPrice: number;
  returnPct: number;
  explanation: string;
  series: number[];
}
export interface RoundResult {
  scenarioId: string;
  index: number;
  weights: Weights;
  startCash: number;
  endEquity: number;
  returnPct: number;
  benchmarkPct: number;
  cashPct: number;
  sessionReturnPct: number;
  sessionEquity: number;
  assets: AssetResult[];
  complete: boolean;
  mode: RoundMode;
  totalRounds: number;
}
export interface SessionState {
  id: string;
  name: string;
  completedRounds: number;
  totalRounds: number;
  equity: number;
  returnPct: number;
}
export interface LeaderboardEntry {
  rank: number;
  name: string;
  returnPct: number;
  equity: number;
  isYou: boolean;
}
