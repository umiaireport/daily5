import type { EvidenceCategory, PublicAssetEvidence, RevealedClue } from '../../shared/evidence.js';
import {
  DAILY_FIVE_RULES,
  money,
  price,
  type Money,
  type OpaqueId,
} from '../../shared/game-rules.js';
import type {
  DailyFivePublic,
  DailyFinalResult,
  DailyRoundPublic,
  DailySavedResult,
  DailyTicketResult,
  SubmitDailyDecisionCommand,
} from '../../shared/daily-five.js';

const CATEGORIES: readonly EvidenceCategory[] = [
  'flow',
  'crowd',
  'whale-footprint',
  'volume',
  'volatility',
  'absorption',
];

function id(value: string): OpaqueId {
  return value;
}

function chart(roundIndex: number, assetIndex: number): PublicAssetEvidence['chart'] {
  return Array.from({ length: 6 }, (_, index) => ({
    at: `2026-09-${String(roundIndex).padStart(2, '0')}T${String(10 + index).padStart(2, '0')}:00:00Z`,
    value: price(`${(1 + assetIndex / 10 + index / 100).toFixed(8)}`),
  }));
}

function clueDescriptor(roundIndex: number, assetIndex: number, category: EvidenceCategory) {
  return {
    clueId: id(`daily-clue-${roundIndex}-${assetIndex}-${category}`),
    category,
    title: category.replace('-', ' '),
    question: 'What did the completed evidence window show before the decision cutoff?',
  } as const;
}

function evidence(assetIndex: number, roundIndex: number): PublicAssetEvidence {
  const cutoff = `2026-09-${String(roundIndex).padStart(2, '0')}T17:00:00Z`;
  return {
    assetId: id(`daily-${roundIndex}-${assetIndex}`),
    attemptAlias: `Mystery ${String.fromCharCode(65 + assetIndex)}`,
    colorIndex: assetIndex,
    chart: chart(roundIndex, assetIndex),
    clueDescriptors: CATEGORIES.map((category) => clueDescriptor(roundIndex, assetIndex, category)),
    unlockedClues: [],
    coverage: {
      status: 'partial',
      description: 'Synthetic fixture coverage is intentionally labeled and bounded.',
      observedAt: cutoff,
    },
    attribution: [{ label: 'Synthetic fixture', sourceKind: 'synthetic' }],
  };
}

function round(roundIndex: number): DailyRoundPublic {
  return {
    roundIndex,
    cutoffAt: `2026-09-${String(roundIndex).padStart(2, '0')}T17:00:00Z`,
    candidates: Array.from({ length: DAILY_FIVE_RULES.candidatesPerRound }, (_, index) =>
      evidence(index, roundIndex),
    ),
    evidence: { status: 'available', sourceKind: 'synthetic' },
    unlocksRemaining: DAILY_FIVE_RULES.clueUnlocksPerRound,
  };
}

export const SYNTHETIC_DAILY_FIVE: DailyFivePublic = {
  dailyId: id('synthetic-daily-2026-09-17'),
  rules: DAILY_FIVE_RULES,
  rounds: Array.from({ length: DAILY_FIVE_RULES.totalRounds }, (_, index) => round(index + 1)),
  publishedAt: '2026-09-17T00:00:00Z',
};

export const SYNTHETIC_DAILY_DECISIONS: readonly SubmitDailyDecisionCommand[] = [
  {
    kind: 'trade',
    roundIndex: 1,
    assetId: id('daily-1-0'),
    side: 'long',
    leverage: 2,
    expectedStateVersion: 1,
    idempotencyKey: 'daily-1-trade',
  },
  {
    kind: 'cash',
    roundIndex: 2,
    expectedStateVersion: 4,
    idempotencyKey: 'daily-2-cash',
  },
  {
    kind: 'trade',
    roundIndex: 3,
    assetId: id('daily-3-2'),
    side: 'short',
    leverage: 1,
    expectedStateVersion: 7,
    idempotencyKey: 'daily-3-trade',
  },
  {
    kind: 'trade',
    roundIndex: 4,
    assetId: id('daily-4-1'),
    side: 'long',
    leverage: 4,
    expectedStateVersion: 10,
    idempotencyKey: 'daily-4-trade',
  },
  {
    kind: 'trade',
    roundIndex: 5,
    assetId: id('daily-5-3'),
    side: 'short',
    leverage: 3,
    expectedStateVersion: 13,
    idempotencyKey: 'daily-5-trade',
  },
];

const ticket = (roundIndex: number, endingEquity: Money): DailyTicketResult => {
  const command = SYNTHETIC_DAILY_DECISIONS[roundIndex - 1]!;
  if (command.kind === 'cash') {
    return {
      roundIndex,
      decision: { kind: 'cash' },
      stake: money('10000.00'),
      endingEquity,
      returnPct: '0.00',
      liquidated: false,
      explanation:
        'Synthetic result fixture; the saved result is available immediately after submission.',
    };
  }
  if (command.kind !== 'trade') throw new Error('Portfolio fixtures need the v1 trade shape.');
  return {
    roundIndex,
    decision: {
      kind: 'trade',
      assetId: command.assetId,
      side: command.side,
      leverage: command.leverage,
    },
    stake: money('10000.00'),
    entryPrice: price('1.00000000'),
    exitPrice: price(roundIndex === 3 ? '1.01000000' : '1.02000000'),
    endingEquity,
    returnPct: roundIndex === 3 ? '-1.00' : '2.00',
    liquidated: false,
    explanation:
      'Synthetic result fixture; the saved result is available immediately after submission.',
  };
};

export const SYNTHETIC_DAILY_SAVED_RESULT: DailySavedResult = {
  phase: 'saved-result',
  stateVersion: 2,
  result: ticket(1, money('10020.00')),
  next: 'continue',
};

export const SYNTHETIC_DAILY_FINAL_RESULT: DailyFinalResult = {
  phase: 'final-result' as const,
  stateVersion: 16,
  tickets: [
    ticket(1, money('10020.00')),
    ticket(2, money('10000.00')),
    ticket(3, money('9900.00')),
    ticket(4, money('10020.00')),
    ticket(5, money('10020.00')),
  ] as const,
  totalEquity: money('49960.00'),
  returnPct: '-0.08',
  cohort: 'synthetic-case-pack-v1',
};

export const SYNTHETIC_UNAVAILABLE_DATA = {
  status: 'unavailable' as const,
  sourceKind: 'historical-snapshot' as const,
  reasonCode: 'incomplete-window' as const,
  message: 'The required historical candle window was incomplete before publication.',
};

export const SYNTHETIC_INVALID_COMMANDS = [
  {
    code: 'STALE_STATE' as const,
    message: 'The command was based on an older state version.',
  },
  {
    code: 'IDEMPOTENCY_CONFLICT' as const,
    message: 'The idempotency key was already used with another payload.',
  },
  {
    code: 'INVALID_PHASE' as const,
    message: 'This command is not accepted in the current phase.',
  },
] as const;

export const SYNTHETIC_TIMEOUT = {
  phase: 'voided' as const,
  code: 'TIMEOUT' as const,
  deadlineAt: '2026-09-18T00:00:00Z',
  reason: 'No complete evidence or settlement arrived before the fixed deadline.',
};

export const SYNTHETIC_REFRESH_RECOVERY = {
  beforeRefresh: { phase: 'saved-result' as const, stateVersion: 2 },
  afterRefresh: { phase: 'saved-result' as const, stateVersion: 2 },
  requiredAction: 'continue' as const,
};

export const SYNTHETIC_REVEALED_CLUE: RevealedClue = {
  clueId: id('daily-clue-0-flow'),
  category: 'flow',
  title: 'Flow evidence',
  factualHeadline: 'Observed transfers were mixed during the completed window.',
  metrics: [{ label: 'Observed transfers', value: '12' }],
  interpretation: 'The sample does not establish a guaranteed future direction.',
  limitation: 'Synthetic fixture coverage is partial.',
  evidenceCutoff: '2026-09-01T17:00:00Z',
  sourceKind: 'synthetic',
  coverage: {
    status: 'partial',
    description: 'Synthetic fixture coverage is intentionally bounded.',
    observedAt: '2026-09-01T17:00:00Z',
  },
  attribution: [{ label: 'Synthetic fixture', sourceKind: 'synthetic' }],
};
