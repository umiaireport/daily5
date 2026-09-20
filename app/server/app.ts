import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { openDatabase } from './db/store.js';
import {
  AuthConflictError,
  AuthValidationError,
  authenticateUser,
  createAuthSession,
  deleteAuthSession,
  ensureDemoUser,
  userByAuthSession,
  userById,
  registerUser,
} from './auth/users.js';
import {
  DailyFiveEngine,
  DailyFiveError,
  createHistoricalDailyFiveCasePack,
  createRandomPracticeCasePack,
  createSyntheticDailyFiveCasePack,
  readDailyFiveSnapshot,
  writeDailyFiveSnapshot,
} from './domain/daily-five/index.js';
import { HuntService } from './services/hunt-service.js';
import { ProgressionService } from './domain/progression/index.js';
import { syncProgression } from './services/progression-feed.js';
import { registerDailyFiveRoutes } from './routes/daily-five.js';
import { registerHuntRoutes } from './routes/hunt.js';
import { registerHuntV2Routes } from './routes/hunt-v2.js';
import { HuntV2Service } from './services/hunt-v2.js';
import { registerMatchmakingRoutes } from './matchmaking/routes.js';
import { registerProgressionRoutes } from './routes/progression.js';
import { dailySettlementSources, registerDailySettlementSources } from './db/daily.js';
import { DailyGame, type DailyChallenge } from './domain/daily.js';
import { Game, GameError } from './domain/game.js';
import {
  collectLiveScenario,
  discoverLiveProviderAssets,
  type LiveProviderAsset,
} from './domain/live.js';
import { createLiveHuntBoardFactory } from './domain/hunt/live-board.js';
import { createNansenClient, type AttemptEvent } from './nansen/client.js';
import { configuredNansenApiKey, configuredNansenCreditBudget } from './nansen/config.js';
import { providerStatus } from './nansen/status.js';
import { COSTS, START_CASH } from './domain/scoring.js';
import { SCENARIOS, type SyntheticScenario } from '../fixtures/synthetic/scenarios.js';
import { DAILY_FIVE_V2_RULES, type DailyFiveV2Rules } from '../shared/game-rules.js';

export interface AppOptions {
  databasePath?: string;
  production?: boolean;
  serveStatic?: boolean;
  logger?: boolean;
  rateLimitMax?: number;
  dataMode?: 'synthetic' | 'live';
}
const COOKIE = 'whale_session';
const AUTH_COOKIE = 'daily5_user';
const DAY = 86_400_000;
const DAILY_FIVE_PROVIDER_COHORT = 'nansen-historical-daily-v3-whale-pools';
const PRACTICE_RULES: DailyFiveV2Rules = {
  ...DAILY_FIVE_V2_RULES,
  totalRounds: 1,
  cohort: 'daily-five-v2',
} as const;

function shuffleProviderAssets(
  assets: readonly LiveProviderAsset[],
  dayStart: number,
): LiveProviderAsset[] {
  const shuffled = [...assets];
  let seed = (Math.floor(dayStart / DAY) ^ 0x9e3779b9) >>> 0;
  const next = () => {
    seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
    return seed;
  };
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = next() % (index + 1);
    [shuffled[index], shuffled[swap]] = [shuffled[swap]!, shuffled[index]!];
  }
  return shuffled;
}

function dailyFiveProviderScenario(
  observedAt: string,
  providerAssets: readonly LiveProviderAsset[],
  dayStart: number,
): SyntheticScenario {
  const templates = SCENARIOS[0]!.assets;
  const assets = shuffleProviderAssets(providerAssets, dayStart);
  return {
    id: `nansen-daily-five-${observedAt.slice(0, 10)}`,
    index: 1,
    mode: 'live',
    sourceLabel: 'Nansen API · historical Daily Five',
    sourceUrl: 'https://nansen.ai',
    title: 'The daily signal',
    subtitle:
      'Twenty-five real provider assets in five fresh pools, with one whale signal hidden in each pool.',
    cutoff: observedAt,
    assets: assets.map((asset, index) => ({
      ...templates[index % templates.length]!,
      id: `nansen-${asset.chain.toLowerCase()}-${asset.address.toLowerCase()}`,
      alias: `${asset.symbol} signal`,
      name: asset.name,
      symbol: asset.symbol,
      providerChain: asset.chain,
      providerTokenAddress: asset.address,
      category: 'ethereum · Nansen historical',
      series: [],
      outcomeSeries: [],
      entry: 1,
      exit: 1,
      explanation: 'Historical price and labeled wallet evidence are collected from Nansen.',
    })),
  };
}

export async function buildApp(options: AppOptions = {}) {
  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 16_384 });
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const db = openDatabase(
    options.databasePath ?? process.env.DATABASE_PATH ?? './data/whale-arena.sqlite',
  );
  ensureDemoUser(db);
  const requestedMode =
    options.dataMode ?? (process.env.DATA_MODE === 'live' ? 'live' : 'synthetic');
  const dailyFiveDayIdPrefix = requestedMode === 'live' ? 'daily-v3-provider-' : undefined;
  const currentDayStart = Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate(),
  );
  const configuredHistoryLagDays = Number(process.env.DAILY_FIVE_HISTORY_LAG_DAYS ?? 2);
  const historyLagDays =
    Number.isInteger(configuredHistoryLagDays) && configuredHistoryLagDays >= 0
      ? configuredHistoryLagDays
      : 2;
  const currentDayId = `${dailyFiveDayIdPrefix ?? 'daily-v2-wallet-'}${new Date(currentDayStart).toISOString().slice(0, 10)}`;
  const dailyFiveSnapshotPath =
    process.env.DAILY_FIVE_PROVIDER_SNAPSHOT ?? './data/daily-five-provider-demo.json';
  const savedHistoricalDailyPack =
    requestedMode === 'live' ? readDailyFiveSnapshot(dailyFiveSnapshotPath, currentDayId) : null;
  const apiKey = configuredNansenApiKey();
  const localSavedProviderPack =
    requestedMode === 'live' && !production && !apiKey
      ? readDailyFiveSnapshot(dailyFiveSnapshotPath, undefined)
      : null;
  const creditBudget = configuredNansenCreditBudget();
  const attemptLog: AttemptEvent[] = [];
  const createProviderClient = () => {
    if (!apiKey) return null;
    return createNansenClient({
      enabled: true,
      apiKey,
      ...(creditBudget === undefined ? {} : { creditBudget }),
      verifiedCreditHeader: 'x-nansen-credits-cost',
      onAttempt: (event) => {
        if (attemptLog.length >= 100) attemptLog.shift();
        attemptLog.push(event);
      },
    });
  };
  let nansen =
    requestedMode === 'live' && !savedHistoricalDailyPack ? createProviderClient() : null;
  let liveAvailable =
    requestedMode === 'live' && Boolean(savedHistoricalDailyPack ?? localSavedProviderPack);
  let liveReason =
    requestedMode === 'live'
      ? savedHistoricalDailyPack
        ? 'Today’s Nansen Daily Five data is loaded from the local same-day snapshot.'
        : localSavedProviderPack
          ? 'A saved Nansen provider pack is loaded for local development; add NANSEN_API for the current UTC board.'
          : apiKey
            ? 'Collecting today’s Nansen Daily Five data.'
            : 'Live Daily Five needs NANSEN_API in the server environment.'
      : providerStatus().reason;
  const providerFailureReason = () => {
    const error = attemptLog.at(-1)?.error;
    if (error === 'credits')
      return 'Nansen rejected the request because the configured account has insufficient API credits. Replenish the account or provide a funded key; synthetic data remains disabled in live mode.';
    if (error === 'credentials')
      return 'Nansen rejected the configured API key or its endpoint permissions. Provide a valid key with access to the required provider endpoints; synthetic data remains disabled in live mode.';
    return 'Nansen live data could not be collected safely. Daily Five requires provider data; synthetic data is available only in explicit practice mode.';
  };
  let scenarios: SyntheticScenario[] = SCENARIOS;
  let liveScenario: SyntheticScenario | null = null;
  const liveHuntEnabled = process.env.NANSEN_LIVE_HUNT === 'true';
  let historicalDailyPack = savedHistoricalDailyPack ?? localSavedProviderPack;
  let historicalFailure: string | null = null;

  async function collectHistoricalPack(dayStart: number) {
    const client =
      dayStart === currentDayStart ? (nansen ?? createProviderClient()) : createProviderClient();
    if (!client) throw new Error('NANSEN_API is not configured.');
    nansen = client;
    const providerAssets = await discoverLiveProviderAssets(client);
    const providerScenario = dailyFiveProviderScenario(
      new Date().toISOString(),
      providerAssets,
      dayStart,
    );
    const dailyId = `${dailyFiveDayIdPrefix!}${new Date(dayStart).toISOString().slice(0, 10)}`;
    const pack = await createHistoricalDailyFiveCasePack(
      dailyId,
      dayStart - historyLagDays * DAY,
      DAILY_FIVE_V2_RULES,
      providerScenario,
      client,
    );
    writeDailyFiveSnapshot(dailyFiveSnapshotPath, pack);
    return pack;
  }

  if (nansen) {
    try {
      historicalDailyPack = await collectHistoricalPack(currentDayStart);
      liveAvailable = true;
      liveReason = 'Today’s Nansen data is ready and saved locally for consistent same-day play.';
    } catch (error) {
      historicalFailure =
        error instanceof Error ? error.message : 'unknown historical collection error';
      liveReason =
        attemptLog.at(-1)?.error === 'credits'
          ? providerFailureReason()
          : `Nansen historical coverage is incomplete (${historicalFailure}). No synthetic data is published as Daily Five.`;
    }
  }
  if (requestedMode === 'live' && liveHuntEnabled && apiKey) {
    try {
      const live = await collectLiveScenario(nansen ?? createProviderClient()!);
      scenarios = [live];
      liveScenario = live;
    } catch {
      if (!historicalDailyPack) liveReason = providerFailureReason();
    }
  }
  let practicePool =
    historicalDailyPack ??
    createSyntheticDailyFiveCasePack(
      `practice-pool-${new Date(currentDayStart).toISOString().slice(0, 10)}`,
      currentDayStart,
      DAILY_FIVE_V2_RULES,
    );
  const game = new Game(db, scenarios);
  const daily = new DailyGame(db);
  const dailyChallenge = ensureDailyChallenge(daily, scenarios[0]!);
  if (dailySettlementSources(db, dailyChallenge.id).length === 0)
    registerDailySettlementSources(
      db,
      dailyChallenge.id,
      scenarios[0]!.assets.map((asset) => ({
        assetId: asset.id,
        kind: asset.providerChain && asset.providerTokenAddress ? ('nansen' as const) : 'synthetic',
        chain: asset.providerChain ?? null,
        tokenAddress: asset.providerTokenAddress ?? null,
        entryPrice: asset.entry,
        fallbackExitPrice: asset.exit,
      })),
    );
  await app.register(cookie);
  await app.register(rateLimit, { max: options.rateLimitMax ?? 240, timeWindow: '1 minute' });
  app.addHook('onClose', async () => {
    db.close();
  });
  app.addHook('onRequest', async (request, reply) => {
    reply
      .header('X-Content-Type-Options', 'nosniff')
      .header('Referrer-Policy', 'same-origin')
      .header('X-Frame-Options', 'DENY');
    if (request.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
    if (production)
      reply.header(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
      );
    const origin = request.headers.origin;
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) && origin) {
      const allowed = new Set([
        `http://${request.headers.host}`,
        `https://${request.headers.host}`,
        process.env.APP_ORIGIN,
      ]);
      if (!production) {
        allowed.add('http://127.0.0.1:8311');
        allowed.add('http://localhost:8311');
      }
      if (!allowed.has(origin))
        throw new GameError('This request came from an unrecognized origin.', 403);
    }
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError)
      return reply
        .code(400)
        .send({ message: 'Invalid request. Check the selected token, card, or allocation.' });
    const status =
      error instanceof GameError
        ? error.statusCode
        : ((error as { statusCode?: number }).statusCode ?? 500);
    if (status >= 500) app.log.error(error);
    return reply.code(status).send({
      message:
        status >= 500
          ? 'The arena hit a snag. Your locked choices are safe; please retry.'
          : error instanceof Error
            ? error.message
            : 'Invalid request.',
    });
  });
  const authSchema = z
    .object({ username: z.string().min(1).max(40), password: z.string().max(80) })
    .strict();
  const registerSchema = z
    .object({
      username: z.string().min(1).max(40),
      password: z.string().min(1).max(80),
      displayName: z.string().max(60).optional(),
    })
    .strict();
  function authenticatedAuthUser(request: FastifyRequest) {
    const user = userByAuthSession(db, request.cookies[AUTH_COOKIE]);
    if (!user) throw new DailyFiveError('FORBIDDEN', 'Log in to continue.', 401);
    return user;
  }
  function authenticatedUser(request: FastifyRequest): string {
    return authenticatedAuthUser(request).id;
  }
  function dailyFivePlayer(request: FastifyRequest): string | undefined {
    return userByAuthSession(db, request.cookies[AUTH_COOKIE])?.id ?? request.cookies[COOKIE];
  }
  function setAuthCookie(reply: { setCookie: FastifyReply['setCookie'] }, userId: string): void {
    reply.setCookie(AUTH_COOKIE, createAuthSession(db, userId), {
      httpOnly: true,
      sameSite: 'lax',
      secure: production,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  app.post('/api/auth/login', async (request, reply) => {
    const { username, password } = authSchema.parse(request.body ?? {});
    const user = authenticateUser(db, username, password);
    if (!user) return reply.code(401).send({ message: 'Invalid username or password.' });
    setAuthCookie(reply, user.id);
    return { username: user.username, displayName: user.displayName };
  });
  app.post('/api/auth/register', async (request, reply) => {
    const { username, password, displayName } = registerSchema.parse(request.body ?? {});
    try {
      const user = registerUser(db, username, password, displayName);
      setAuthCookie(reply, user.id);
      return reply.code(201).send({ username: user.username, displayName: user.displayName });
    } catch (error) {
      if (error instanceof AuthConflictError)
        return reply.code(409).send({ message: error.message });
      if (error instanceof AuthValidationError)
        return reply.code(400).send({ message: error.message });
      throw error;
    }
  });
  app.get('/api/auth/me', async (request) => {
    const user = authenticatedAuthUser(request);
    return { username: user.username, displayName: user.displayName };
  });
  app.post('/api/auth/logout', async (request, reply) => {
    deleteAuthSession(db, request.cookies[AUTH_COOKIE]);
    reply.clearCookie(AUTH_COOKIE, { path: '/' });
    return { ok: true };
  });
  function sessionId(request: FastifyRequest): string {
    const id = request.cookies[COOKIE];
    if (!id) throw new GameError('Start a session to enter the arena.', 401);
    game.session(id);
    return id;
  }
  const providerIdentityForKey = (key: string) => {
    const normalized = key.toLowerCase();
    const candidate = historicalDailyPack?.privateRounds
      .flatMap((round) => round.candidates)
      .find((item) => item.realAssetKey?.toLowerCase() === normalized);
    return candidate?.realAssetName || candidate?.realAssetSymbol
      ? {
          name: candidate.realAssetName ?? 'Provider asset',
          symbol: candidate.realAssetSymbol ?? 'ASSET',
        }
      : undefined;
  };

  const createDailyFiveEngine = () =>
    new DailyFiveEngine(db, {
      rules: DAILY_FIVE_V2_RULES,
      displayNameForPlayer: (playerId) =>
        userById(db, playerId)?.displayName ?? `player-${playerId.slice(0, 6)}`,
      ...(requestedMode === 'live'
        ? {
            privateAssetIdentityForKey: providerIdentityForKey,
            dayIdPrefix: dailyFiveDayIdPrefix,
            requiredCohort: DAILY_FIVE_PROVIDER_COHORT,
            publishedDailyId: historicalDailyPack?.publicChallenge.dailyId,
          }
        : {}),
      ...(historicalDailyPack
        ? {
            casePackFor: (dailyId: string) =>
              historicalDailyPack!.publicChallenge.dailyId === dailyId
                ? historicalDailyPack!
                : (() => {
                    throw new Error(
                      'The provider-backed Daily Five pack is published for today only.',
                    );
                  })(),
          }
        : requestedMode === 'live'
          ? {
              casePackFor: () => {
                throw new DailyFiveError(
                  'UNAVAILABLE',
                  `Daily Five provider data is unavailable. ${liveReason}`,
                );
              },
            }
          : {}),
    });

  const createPracticeEngine = () =>
    new DailyFiveEngine(db, {
      rules: PRACTICE_RULES,
      displayNameForPlayer: (playerId) =>
        userById(db, playerId)?.displayName ?? `player-${playerId.slice(0, 6)}`,
      casePackFor: (dailyId: string, dayStart: number) =>
        createRandomPracticeCasePack(dailyId, dayStart, PRACTICE_RULES, practicePool),
      ...(requestedMode === 'live' ? { privateAssetIdentityForKey: providerIdentityForKey } : {}),
    });

  let dailyFive = createDailyFiveEngine();
  let practice = createPracticeEngine();
  let refreshInFlight: Promise<void> | null = null;
  const ensureCurrentLivePack = async (): Promise<void> => {
    if (requestedMode !== 'live') return;
    if (localSavedProviderPack && !apiKey) return;
    const now = new Date();
    const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const dailyId = `${dailyFiveDayIdPrefix!}${new Date(dayStart).toISOString().slice(0, 10)}`;
    if (historicalDailyPack?.publicChallenge.dailyId === dailyId) return;
    if (!apiKey) {
      liveAvailable = false;
      liveReason = 'Live Daily Five needs NANSEN_API in the server environment.';
      return;
    }
    if (!refreshInFlight) {
      refreshInFlight = (async () => {
        try {
          historicalDailyPack = await collectHistoricalPack(dayStart);
          practicePool = historicalDailyPack;
          dailyFive = createDailyFiveEngine();
          practice = createPracticeEngine();
          liveAvailable = true;
          liveReason =
            'Today’s Nansen data is ready and saved locally for consistent same-day play.';
        } catch (error) {
          historicalFailure =
            error instanceof Error ? error.message : 'unknown historical collection error';
          liveAvailable = false;
          liveReason =
            attemptLog.at(-1)?.error === 'credits'
              ? providerFailureReason()
              : `Nansen historical coverage is incomplete (${historicalFailure}).`;
        } finally {
          refreshInFlight = null;
        }
      })();
    }
    await refreshInFlight;
  };
  app.addHook('preHandler', async (request) => {
    if (request.url.startsWith('/api/daily-five') || request.url.startsWith('/api/practice'))
      await ensureCurrentLivePack();
  });
  const hunt = new HuntService(db);
  const huntV2 = new HuntV2Service(db, {
    boardFactory: liveScenario ? createLiveHuntBoardFactory(liveScenario) : undefined,
  });
  app.addHook('onClose', async () => {
    hunt.dispose();
    huntV2.dispose();
  });
  const progression = new ProgressionService(db);
  syncProgression(db, progression);
  app.addHook('onSend', async (request, reply, payload) => {
    if (request.url.startsWith('/api/') && reply.statusCode < 400) syncProgression(db, progression);
    return payload;
  });
  await registerDailyFiveRoutes(app, {
    getEngine: () => dailyFive,
    cookieName: AUTH_COOKIE,
    playerId: dailyFivePlayer,
  });
  app.get('/api/account/history', async (request) => dailyFive.history(authenticatedUser(request)));
  app.get('/api/leaderboards/all-time', async (request) => {
    authenticatedUser(request);
    return dailyFive.allTimeLeaderboard(100);
  });
  await registerDailyFiveRoutes(app, {
    getEngine: () => practice,
    routePrefix: '/api/practice',
    getToday: () => practice.practice(),
    defaultMode: 'practice',
    leaderboardEnabled: false,
    cookieName: AUTH_COOKIE,
    playerId: dailyFivePlayer,
  });
  await registerHuntRoutes(app, {
    engine: hunt,
    playerId: sessionId,
    replaySummary: (id, actor) => hunt.replaySummary(id, actor),
  });
  await registerHuntV2Routes(app, { service: huntV2, playerId: sessionId });
  await registerMatchmakingRoutes(app, { engine: hunt, playerId: sessionId });
  await registerProgressionRoutes(app, { service: progression, playerId: sessionId });
  const sessionSchema = z.object({}).strict();
  const scenarioParams = z.object({ id: z.string().max(80) });
  app.post('/api/sessions', async (request, reply) => {
    sessionSchema.parse(request.body ?? {});
    const existing = request.cookies[COOKIE];
    if (existing) {
      try {
        return game.session(existing);
      } catch (error) {
        if (!(error instanceof GameError) || error.statusCode !== 401) throw error;
      }
    }
    const session = game.createSession();
    reply.setCookie(COOKIE, session.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: production,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return session;
  });
  app.post('/api/sessions/reset', async (request, reply) => {
    sessionSchema.parse(request.body ?? {});
    const session = game.createSession();
    reply.setCookie(COOKIE, session.id, {
      httpOnly: true,
      sameSite: 'lax',
      secure: production,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return session;
  });
  app.get('/api/session', async (request) => game.session(sessionId(request)));
  app.get('/api/scenarios/next', async (request) => game.next(sessionId(request)));
  app.post('/api/scenarios/:id/unlock', async (request) => {
    const { id } = scenarioParams.parse(request.params);
    const { assetId, kind } = z
      .object({ assetId: z.enum(['a', 'b', 'c']), kind: z.enum(['flow', 'buyers', 'pulse']) })
      .strict()
      .parse(request.body);
    return game.unlock(sessionId(request), id, assetId, kind);
  });
  app.post('/api/scenarios/:id/choice', async (request) => {
    const { id } = scenarioParams.parse(request.params);
    const { weights } = z.object({ weights: z.unknown() }).strict().parse(request.body);
    return game.choose(sessionId(request), id, weights);
  });
  app.get('/api/scenarios/:id/result', async (request) =>
    game.result(sessionId(request), scenarioParams.parse(request.params).id),
  );
  app.post('/api/scenarios/:id/continue', async (request) => {
    sessionSchema.parse(request.body ?? {});
    return game.advance(sessionId(request), scenarioParams.parse(request.params).id);
  });
  app.get('/api/leaderboard', async (request) => ({
    entries: game.leaderboard(sessionId(request)),
  }));
  app.get('/api/challenges/today', async () => ({
    available: liveAvailable,
    mode: liveAvailable ? 'live' : requestedMode === 'live' ? 'unavailable' : 'synthetic',
    observedAt: liveAvailable ? scenarios[0]?.cutoff : undefined,
    reason: liveReason,
    sourceLabel: liveAvailable ? scenarios[0]?.sourceLabel : undefined,
    sourceUrl: liveAvailable ? scenarios[0]?.sourceUrl : undefined,
    daily: dailySummary(daily, dailyChallenge),
  }));
  app.get('/api/daily/today', async () => dailySummary(daily, dailyChallenge));
  app.post('/api/daily/today/entry', async (request) => {
    const { weights } = z.object({ weights: z.unknown() }).strict().parse(request.body);
    try {
      return daily.enter(sessionId(request), dailyChallenge.id, weights);
    } catch (error) {
      if (error instanceof GameError) throw error;
      throw new GameError(
        error instanceof Error ? error.message : 'Daily entry was rejected.',
        error instanceof Error &&
          (error.message.includes('outside') || error.message.includes('already locked'))
          ? 409
          : 400,
      );
    }
  });
  app.get('/api/daily/today/result', async (request) => {
    try {
      return daily.result(sessionId(request), dailyChallenge.id);
    } catch (error) {
      if (error instanceof GameError) throw error;
      if (error instanceof Error && error.message.includes('No official entry'))
        return { status: 'none', challengeId: dailyChallenge.id };
      throw new GameError(error instanceof Error ? error.message : 'Daily entry not found.', 404);
    }
  });
  app.get('/healthz', async () => ({
    status: 'ok',
    mode: liveAvailable ? 'live' : requestedMode === 'live' ? 'unavailable' : 'synthetic',
    provider: liveAvailable ? 'nansen' : requestedMode === 'live' ? 'unavailable' : 'disabled',
    scenarioVersion: liveAvailable
      ? 'nansen-live-v1'
      : requestedMode === 'live'
        ? 'provider-unavailable'
        : 'synthetic-v1',
    liveAvailable,
  }));
  app.get('/api/admin/usage', async (request, reply) => {
    if (
      !process.env.ADMIN_TOKEN ||
      request.headers.authorization !== `Bearer ${process.env.ADMIN_TOKEN}`
    )
      return reply.code(401).send({ message: 'Administrator authentication required.' });
    return {
      projectId: 'whale-arena',
      mode: liveAvailable ? 'live' : requestedMode === 'live' ? 'unavailable' : 'synthetic',
      ...nansen?.usage(),
      attempts: nansen?.usage().attempts ?? 0,
      successfulCalls: nansen?.usage().successfulHttpCalls ?? 0,
      validCalls: nansen?.usage().dataValidCalls ?? 0,
      deductedCredits: nansen?.usage().actualDeductedCredits ?? 0,
      reason: liveReason,
    };
  });
  if (options.serveStatic) {
    const root = resolve('public');
    if (!existsSync(resolve(root, 'index.html')))
      throw new Error('Build the web app before starting production: npm run build');
    await app.register(staticFiles, { root });
    app.setNotFoundHandler((request, reply) =>
      request.url.startsWith('/api/') || !request.headers.accept?.includes('text/html')
        ? reply.code(404).send({ message: 'Route not found.' })
        : reply.sendFile('index.html'),
    );
  }
  return app;
}

const DAILY_DAY = 86_400_000;

function dailySummary(daily: DailyGame, challenge: DailyChallenge) {
  const status = daily.status(challenge.id);
  const now = Date.now();
  const opens = Date.parse(challenge.opensAt);
  const locks = Date.parse(challenge.locksAt);
  return {
    id: challenge.id,
    available: status === 'pending' && now >= opens && now < locks,
    status,
    mode:
      challenge.evidence &&
      typeof challenge.evidence === 'object' &&
      !Array.isArray(challenge.evidence)
        ? ((challenge.evidence as { mode?: string }).mode ?? 'synthetic')
        : 'synthetic',
    opensAt: challenge.opensAt,
    locksAt: challenge.locksAt,
    entryAt: challenge.entryAt,
    settleAt: challenge.settleAt,
    voidAt: challenge.voidAt,
    challenge,
  };
}

function ensureDailyChallenge(daily: DailyGame, scenario: SyntheticScenario): DailyChallenge {
  const now = new Date();
  let dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  if (now.getTime() >= dayStart + DAILY_DAY) dayStart += DAILY_DAY;
  const id = `daily-${new Date(dayStart).toISOString().slice(0, 10)}`;
  try {
    return daily.challenge(id);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('not found')) throw error;
  }
  const opensAt = new Date(dayStart).toISOString();
  const locksAt = new Date(dayStart + DAILY_DAY).toISOString();
  const challenge: DailyChallenge = {
    id,
    version: 'daily-v1',
    evidenceVersion: 'daily-evidence-v1',
    assetIds: scenario.assets.map((asset) => asset.id) as [string, string, string],
    evidence: {
      mode: scenario.mode ?? 'synthetic',
      sourceLabel: scenario.sourceLabel ?? 'Synthetic fixture',
      sourceUrl: scenario.sourceUrl ?? '',
      observedAt: scenario.cutoff,
      title: scenario.title,
      subtitle: scenario.subtitle,
      assets: scenario.assets.map((asset) => ({
        id: asset.id,
        alias: asset.alias,
        category: asset.category,
        series: asset.series,
        clues: asset.clues,
      })),
    } as unknown as DailyChallenge['evidence'],
    rules: {
      version: COSTS.version,
      startCash: START_CASH,
      entryCostBps: COSTS.entry * 10_000,
      exitCostBps: COSTS.exit * 10_000,
    },
    opensAt,
    locksAt,
    entryAt: locksAt,
    settleAt: new Date(dayStart + DAILY_DAY * 2).toISOString(),
    voidAt: new Date(dayStart + DAILY_DAY * 3).toISOString(),
  };
  return daily.publish(challenge);
}
