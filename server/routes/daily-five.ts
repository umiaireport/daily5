import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type {
  ContinueDailyCommand,
  StartDailyFiveCommand,
  SubmitDailyDecisionCommand,
  UnlockDailyClueCommand,
} from '../../shared/daily-five.js';
import { DailyFiveEngine, DailyFiveError } from '../domain/daily-five/index.js';

export interface DailyFiveRouteOptions {
  readonly engine: DailyFiveEngine;
  readonly playerId?: (request: FastifyRequest) => string | undefined;
  readonly cookieName?: string;
  readonly routePrefix?: string;
  readonly getToday?: () => unknown;
  readonly defaultMode?: 'official' | 'practice';
  readonly leaderboardEnabled?: boolean;
}

const idSchema = z.object({ id: z.string().min(1).max(160) }).strict();
const startSchema = z
  .object({
    idempotencyKey: z.string().min(1).max(160),
    mode: z.enum(['official', 'practice']).optional(),
  })
  .strict();
const commandMeta = z.object({
  expectedStateVersion: z.number().int().min(1),
  idempotencyKey: z.string().min(1).max(160),
});
const clueSchema = commandMeta
  .extend({
    kind: z.literal('unlock-clue'),
    roundIndex: z.number().int().min(1).max(5),
    assetId: z.string().min(1).max(160),
    clueId: z.string().min(1).max(200),
  })
  .strict();
const tradeSchema = commandMeta
  .extend({
    kind: z.literal('trade'),
    roundIndex: z.number().int().min(1).max(5),
    assetId: z.string().min(1).max(160),
    side: z.enum(['long', 'short']),
    leverage: z.number().int().min(1).max(100),
  })
  .strict();
const cashSchema = commandMeta
  .extend({ kind: z.literal('cash'), roundIndex: z.number().int().min(1).max(5) })
  .strict();
const portfolioSchema = commandMeta
  .extend({
    kind: z.literal('portfolio'),
    roundIndex: z.number().int().min(1).max(5),
    allocations: z
      .array(
        z
          .object({
            assetId: z.string().min(1).max(160),
            weightBps: z.number().int().min(0).max(10_000),
            leverage: z.number().int().min(1).max(100).optional(),
          })
          .strict(),
      )
      .max(5),
    cashWeightBps: z.number().int().min(0).max(10_000),
  })
  .strict();
const ticketSchema = z.discriminatedUnion('kind', [tradeSchema, cashSchema, portfolioSchema]);
const continueSchema = commandMeta
  .extend({ kind: z.literal('continue'), roundIndex: z.number().int().min(1).max(5) })
  .strict();

function params(request: FastifyRequest): { id: string } {
  return idSchema.parse(request.params);
}

function sendError(error: unknown, reply: FastifyReply): unknown {
  if (error instanceof DailyFiveError)
    return reply.code(error.statusCode).send({
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.stateVersion === undefined ? {} : { stateVersion: error.stateVersion }),
    });
  if (error instanceof z.ZodError)
    return reply
      .code(400)
      .send({ code: 'INVALID_COMMAND', message: 'Invalid Daily Five command.', retryable: false });
  throw error;
}

function identity(request: FastifyRequest, options: DailyFiveRouteOptions): string {
  const playerId =
    options.playerId?.(request) ?? request.cookies?.[options.cookieName ?? 'whale_session'];
  if (!playerId)
    throw new DailyFiveError('FORBIDDEN', 'Start a session before entering Daily Five.', 401);
  return playerId;
}

async function safely<T>(reply: FastifyReply, action: () => T | Promise<T>): Promise<T | void> {
  try {
    return await action();
  } catch (error) {
    return sendError(error, reply) as void;
  }
}

/** Registers the Daily Five HTTP boundary without owning application startup or cookie setup. */
export async function registerDailyFiveRoutes(
  app: FastifyInstance,
  options: DailyFiveRouteOptions,
): Promise<void> {
  const prefix = options.routePrefix ?? '/api/daily-five';
  const leaderboardEnabled = options.leaderboardEnabled ?? true;
  app.get(`${prefix}/today`, async (_request, reply) =>
    safely(reply, () => options.getToday?.() ?? options.engine.today()),
  );
  app.post(`${prefix}/:id/attempts`, async (request, reply) =>
    safely(reply, () => {
      const { id } = params(request);
      const parsed = startSchema.parse(request.body) as StartDailyFiveCommand;
      const command = {
        ...parsed,
        ...(options.defaultMode ? { mode: options.defaultMode } : {}),
      } as StartDailyFiveCommand;
      return options.engine.start(id, identity(request, options), command);
    }),
  );
  app.get(`${prefix}/attempts/:id`, async (request, reply) =>
    safely(reply, () => options.engine.resume(identity(request, options), params(request).id)),
  );
  app.post(`${prefix}/attempts/:id/clues`, async (request, reply) =>
    safely(reply, () => {
      const command = clueSchema.parse(request.body) as UnlockDailyClueCommand;
      return options.engine.unlock(identity(request, options), params(request).id, command);
    }),
  );
  app.post(`${prefix}/attempts/:id/tickets`, async (request, reply) =>
    safely(reply, () => {
      const command = ticketSchema.parse(request.body) as SubmitDailyDecisionCommand;
      return options.engine.submit(identity(request, options), params(request).id, command);
    }),
  );
  app.post(`${prefix}/attempts/:id/continue`, async (request, reply) =>
    safely(reply, () => {
      const command = continueSchema.parse(request.body) as ContinueDailyCommand;
      return options.engine.continue(identity(request, options), params(request).id, command);
    }),
  );
  if (leaderboardEnabled)
    app.get(`${prefix}/:id/leaderboard`, async (request, reply) =>
      safely(reply, () =>
        options.engine.leaderboard(
          params(request).id,
          options.playerId?.(request) ?? request.cookies?.[options.cookieName ?? 'whale_session'],
        ),
      ),
    );
}

export const dailyFiveRoutes = registerDailyFiveRoutes;
