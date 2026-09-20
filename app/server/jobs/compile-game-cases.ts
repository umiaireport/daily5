import {
  compileDailyCase,
  compileHuntBoard,
  type CompileOptions,
  type DailyCaseCompileInput,
} from '../evidence/compiler.js';
import { matchVariants } from '../evidence/variants.js';
import type {
  CollectedGameEvidence,
  CompiledDailyCase,
  CompiledHuntBoard,
  VariantMatchResult,
} from '../evidence/types.js';
import { EVIDENCE_CONTENT_VERSION } from '../evidence/types.js';

export interface CompileGameCasesInput {
  readonly collections: readonly CollectedGameEvidence[];
  readonly compileOptions?: CompileOptions;
}

export interface CompiledGameCaseLibrary {
  readonly libraryVersion: 'game-case-library-v1';
  readonly contentVersion: string;
  readonly cases: readonly CompiledDailyCase[];
  readonly candidatePacks: readonly (readonly CompiledDailyCase[])[];
  readonly variants: VariantMatchResult;
}

function compileCollection(
  collection: CollectedGameEvidence,
  options: CompileOptions,
): readonly CompiledDailyCase[] {
  return collection.assets.map((asset) =>
    compileDailyCase(
      {
        ...asset,
        rulesVersion: options.rulesVersion,
        contentVersion: options.contentVersion,
      },
      options,
    ),
  );
}

/** Compile immutable private cases and compare complete candidate packs at job time. */
export function compileGameCases(input: CompileGameCasesInput): CompiledGameCaseLibrary {
  const options = input.compileOptions ?? {};
  const candidatePacks = input.collections.map((collection) =>
    compileCollection(collection, options),
  );
  const cases = candidatePacks.flat();
  const variants = matchVariants(candidatePacks);
  return Object.freeze({
    libraryVersion: 'game-case-library-v1' as const,
    contentVersion: options.contentVersion ?? EVIDENCE_CONTENT_VERSION,
    cases: Object.freeze(cases),
    candidatePacks: Object.freeze(candidatePacks.map((pack) => Object.freeze([...pack]))),
    variants,
  });
}

export interface CompileHuntBoardJobInput {
  readonly boardId: string;
  readonly cases: readonly DailyCaseCompileInput[];
  readonly compileOptions?: CompileOptions;
}

/** Compile a six-to-ten-asset Hunt board from the same private case representation. */
export function compileGameHuntBoard(input: CompileHuntBoardJobInput): CompiledHuntBoard {
  return compileHuntBoard({ boardId: input.boardId, cases: input.cases }, input.compileOptions);
}
