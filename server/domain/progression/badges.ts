import type { ProgressionBadge } from '../../../shared/progression.js';
import type { ProgressionHuntRole } from './types.js';

export const PROGRESSION_BADGES = {
  firstFive: 'first-five',
  clearReading: 'clear-reading',
  firstContact: 'first-contact',
  patternReader: 'pattern-reader',
  quietCurrent: 'quiet-current',
  falseWake: 'false-wake',
  bothSides: 'both-sides',
} as const;

export type ProgressionBadgeId = (typeof PROGRESSION_BADGES)[keyof typeof PROGRESSION_BADGES];

export const BADGE_DEFINITIONS: readonly Omit<ProgressionBadge, 'earnedAt'>[] = [
  {
    badgeId: PROGRESSION_BADGES.firstFive,
    title: 'First Five',
    description: 'Finish one Daily Five run.',
  },
  {
    badgeId: PROGRESSION_BADGES.clearReading,
    title: 'Clear Reading',
    description: 'Trade all five Daily Five rounds in the correct directions.',
  },
  {
    badgeId: PROGRESSION_BADGES.firstContact,
    title: 'First Contact',
    description: 'Identify both Hunt targets.',
  },
  {
    badgeId: PROGRESSION_BADGES.patternReader,
    title: 'Pattern Reader',
    description: 'Find the Hunt pair before the final round in three matches.',
  },
  {
    badgeId: PROGRESSION_BADGES.quietCurrent,
    title: 'Quiet Current',
    description: 'Complete a whale objective and evade capture.',
  },
  {
    badgeId: PROGRESSION_BADGES.falseWake,
    title: 'False Wake',
    description: 'Win as whale while the final accusation includes a decoy.',
  },
  {
    badgeId: PROGRESSION_BADGES.bothSides,
    title: 'Both Sides',
    description: 'Win at least once as whale and once as tracer.',
  },
];

export function badgeDefinition(id: string): Omit<ProgressionBadge, 'earnedAt'> | undefined {
  return BADGE_DEFINITIONS.find((badge) => badge.badgeId === id);
}

export function dailyBadgeIds(input: {
  readonly correctDirections: number;
  readonly directionalTrades: number;
}): readonly ProgressionBadgeId[] {
  const badges: ProgressionBadgeId[] = [PROGRESSION_BADGES.firstFive];
  if (input.directionalTrades === 5 && input.correctDirections === 5)
    badges.push(PROGRESSION_BADGES.clearReading);
  return badges;
}

export function huntBadgeIds(input: {
  readonly role: ProgressionHuntRole;
  readonly won: boolean;
  readonly finalPairCorrect: boolean;
  readonly finalIncludesDecoy: boolean;
}): readonly ProgressionBadgeId[] {
  const badges: ProgressionBadgeId[] = [];
  const tracerRole = input.role === 'tracer' || input.role === 'captain';
  if (tracerRole && input.finalPairCorrect) badges.push(PROGRESSION_BADGES.firstContact);
  if (input.role === 'whale' && input.won) {
    badges.push(PROGRESSION_BADGES.quietCurrent);
    if (input.finalIncludesDecoy) badges.push(PROGRESSION_BADGES.falseWake);
  }
  return badges;
}
