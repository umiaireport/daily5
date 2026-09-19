import Fastify, { type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { openDatabase } from './db/store.js';
import {
  DailyFiveEngine,
  DailyFiveError,
  createHistoricalDailyFiveCasePack,
  createRandomPracticeCasePack,
  createSyntheticDailyFiveCasePack,
  readLatestDailyFiveSnapshot,
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
import { collectLiveScenario } from './domain/live.js';
import { createLiveHuntBoardFactory } from './domain/hunt/live-board.js';
import { createNansenClient, type AttemptEvent } from './nansen/client.js';
import { configuredNansenApiKey } from './nansen/config.js';
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

const DAILY_FIVE_PROVIDER_ASSETS = [
  {
    symbol: 'WETH',
    name: 'Wrapped Ether',
    chain: 'ethereum',
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  },
  {
    symbol: 'WBTC',
    name: 'Wrapped Bitcoin',
    chain: 'ethereum',
    address: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
  },
  {
    symbol: 'PEPE',
    name: 'Pepe',
    chain: 'ethereum',
    address: '0x6982508145454Ce325dDbE47a25d4ec3d2311933',
  },
  {
    symbol: 'USDC',
    name: 'USD Coin',
    chain: 'ethereum',
    address: '0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  },
  {
    symbol: 'AAVE',
    name: 'Aave',
    chain: 'ethereum',
    address: '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9',
  },
  {
    symbol: 'UNI',
    name: 'Uniswap',
    chain: 'ethereum',
    address: '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984',
  },
  {
    symbol: 'LINK',
    name: 'Chainlink',
    chain: 'ethereum',
    address: '0x514910771AF9Ca656af840dff83E8264EcF986CA',
  },
  {
    symbol: 'MKR',
    name: 'Maker',
    chain: 'ethereum',
    address: '0x9f8F72aA9304c8B593d555F12eF6589cC3A579A2',
  },
  {
    symbol: 'LDO',
    name: 'Lido DAO',
    chain: 'ethereum',
    address: '0x5A98FcBEA516Cf06857215779Fd812CA3beF1B32',
  },
  {
    symbol: 'SHIB',
    name: 'Shiba Inu',
    chain: 'ethereum',
    address: '0x95aD61b0a150d79219dCF64E1E6Cc01f0B64C4cE',
  },
  {
    symbol: 'USDT',
    name: 'Tether USD',
    chain: 'ethereum',
    address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },
  {
    symbol: 'DAI',
    name: 'Dai',
    chain: 'ethereum',
    address: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  },
  {
    symbol: 'CRV',
    name: 'Curve DAO',
    chain: 'ethereum',
    address: '0xD533a949740bb3306d119CC777fa900bA034cd52',
  },
  {
    symbol: 'COMP',
    name: 'Compound',
    chain: 'ethereum',
    address: '0xC00e94Cb662C3520282E6f5717214004A7f26888',
  },
  {
    symbol: 'SNX',
    name: 'Synthetix',
    chain: 'ethereum',
    address: '0xC011a72400E58ecD99Ee497CF89E3775d4bd732F',
  },
  {
    symbol: 'LRC',
    name: 'Loopring',
    chain: 'ethereum',
    address: '0xBBbbCA6A901c926F240b89EacB641d8Aec7AEafD',
  },
  {
    symbol: 'SUSHI',
    name: 'Sushi',
    chain: 'ethereum',
    address: '0x6B3595068778DD592e39A122f4f5a5cf09C90fE2',
  },
  {
    symbol: 'BAT',
    name: 'Basic Attention Token',
    chain: 'ethereum',
    address: '0x0D8775F648430679A709E98d2b0Cb6250d2887EF',
  },
  {
    symbol: 'ENS',
    name: 'Ethereum Name Service',
    chain: 'ethereum',
    address: '0xC18360217D8F7Ab5e7c516566761Ea12Ce7F9D72',
  },
  {
    symbol: '1INCH',
    name: '1inch',
    chain: 'ethereum',
    address: '0x111111111117dC0aa78b770fA6A738034120C302',
  },
  {
    symbol: 'DYDX',
    name: 'dYdX',
    chain: 'ethereum',
    address: '0x92D6C1e31e14520e676a687F0a93788B716BEff5',
  },
  {
    symbol: 'GRT',
    name: 'The Graph',
    chain: 'ethereum',
    address: '0xc944E90C64B2c07662A292be6244BDf05Cda44a7',
  },
  {
    symbol: 'YFI',
    name: 'yearn.finance',
    chain: 'ethereum',
    address: '0x0bc529c00C6401aEF6D220BE8C6Ea1667F6Ad93e',
  },
  {
    symbol: 'RPL',
    name: 'Rocket Pool',
    chain: 'ethereum',
    address: '0xD33526068D116cE69F19A9ee46F0bd304F21A51f',
  },
  {
    symbol: 'APE',
    name: 'ApeCoin',
    chain: 'ethereum',
    address: '0x4d224452801aced8B2F0aebe155379bb5D594381',
  },
  {
    symbol: 'FXS',
    name: 'Frax Share',
    chain: 'ethereum',
    address: '0x5E8422345238F34275888049021821E8E08CAa1f',
  },
  {
    symbol: 'BAL',
    name: 'Balancer',
    chain: 'ethereum',
    address: '0xba100000625a3754423978a60c9317c58a424e3D',
  },
  {
    symbol: 'GNO',
    name: 'Gnosis',
    chain: 'ethereum',
    address: '0x6810e776880c02933d47db1b9fc05908e5386b96',
  },
  {
    symbol: 'QNT',
    name: 'Quant',
    chain: 'ethereum',
    address: '0x4a220E6096B25EADb88358cb44068A3248254675',
  },
  {
    symbol: 'ZRX',
    name: '0x',
    chain: 'ethereum',
    address: '0xE41d2489571d322189246DaFA5ebDe1F4699F498',
  },
  {
    symbol: 'KNC',
    name: 'Kyber Network Crystal',
    chain: 'ethereum',
    address: '0xdefa4e8a7bcba345f687a2f1456f5edd9ce97202',
  },
  {
    symbol: 'BNT',
    name: 'Bancor',
    chain: 'ethereum',
    address: '0x1f573d6Fb3F13d689ff844B4cEce4E8cA4E45D4f',
  },
  {
    symbol: 'AXS',
    name: 'Axie Infinity',
    chain: 'ethereum',
    address: '0xbb0e17ef65f82ab018d8edd776e8dd940327b28b',
  },
  {
    symbol: 'FET',
    name: 'Artificial Superintelligence Alliance',
    chain: 'ethereum',
    address: '0xaea46A60368A7bD060eec7DF8CBa43b7EF41Ad85',
  },
  {
    symbol: 'OCEAN',
    name: 'Ocean Protocol',
    chain: 'ethereum',
    address: '0x967da4048cD07ab37855c090aAF366e4ce1b9F48',
  },
  {
    symbol: 'TUSD',
    name: 'TrueUSD',
    chain: 'ethereum',
    address: '0x0000000000085d4780B73119b644AE5ecd22b376',
  },
  {
    symbol: 'FRAX',
    name: 'Frax',
    chain: 'ethereum',
    address: '0x853d955aCEf822Db058eb8505911ED77F175b99e',
  },
  {
    symbol: 'PAXG',
    name: 'PAX Gold',
    chain: 'ethereum',
    address: '0x45804880De22913dAFE09f4980848ECE6EcbAf78',
  },
  {
    symbol: 'LPT',
    name: 'Livepeer',
    chain: 'ethereum',
    address: '0x58b6A8A3302369DAEc383334672404Ee733aB239',
  },
  {
    symbol: 'SAND',
    name: 'The Sandbox',
    chain: 'ethereum',
    address: '0x3845badade8e6dff049820680d1f14bd3903a5d0',
  },
] as const;

function dailyFiveProviderScenario(observedAt: string): SyntheticScenario {
  const templates = SCENARIOS[0]!.assets;
  return {
    id: `nansen-daily-five-${observedAt.slice(0, 10)}`,
    index: 1,
    mode: 'live',
    sourceLabel: 'Nansen API · historical Daily Five',
    sourceUrl: 'https://nansen.ai',
    title: 'The daily signal',
    subtitle:
      'Twenty-five real Ethereum assets in five fresh pools, with one whale signal hidden in each pool.',
    cutoff: observedAt,
    assets: DAILY_FIVE_PROVIDER_ASSETS.map((asset, index) => ({
      ...templates[index % templates.length]!,
      id: `nansen-${asset.symbol.toLowerCase()}`,
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
  const historicalAnchorDayStart = currentDayStart - historyLagDays * DAY;
  const currentDayId = `${dailyFiveDayIdPrefix ?? 'daily-v2-wallet-'}${new Date(currentDayStart).toISOString().slice(0, 10)}`;
  const dailyFiveSnapshotPath =
    process.env.DAILY_FIVE_PROVIDER_SNAPSHOT ?? './data/daily-five-provider-demo.json';
  const downloadDailyFive = process.env.DAILY_FIVE_DOWNLOAD === 'true';
  const savedHistoricalDailyPack =
    requestedMode === 'live'
      ? (readDailyFiveSnapshot(dailyFiveSnapshotPath, currentDayId, DAILY_FIVE_PROVIDER_ASSETS) ??
        readLatestDailyFiveSnapshot(dailyFiveSnapshotPath, DAILY_FIVE_PROVIDER_ASSETS))
      : null;
  const apiKey = configuredNansenApiKey();
  const attemptLog: AttemptEvent[] = [];
  const nansen =
    requestedMode === 'live' && downloadDailyFive && !savedHistoricalDailyPack && apiKey?.trim()
      ? createNansenClient({
          enabled: true,
          apiKey,
          creditBudget: Number(process.env.NANSEN_CREDIT_BUDGET ?? 10),
          verifiedCreditHeader: 'x-nansen-credits-cost',
          onAttempt: (event) => {
            if (attemptLog.length >= 100) attemptLog.shift();
            attemptLog.push(event);
          },
        })
      : null;
  let liveAvailable = false;
  let liveReason =
    requestedMode === 'live'
      ? savedHistoricalDailyPack
        ? 'Saved Nansen Daily Five data is loaded locally; no provider request is needed.'
        : downloadDailyFive
          ? apiKey?.trim()
            ? 'Live collection is unavailable right now; Daily Five will remain unavailable until provider data is collected.'
            : 'The one-time Daily Five download needs NANSEN_API (or a configured legacy NANSEN_API2/NANSEN_API_KEY alias) in the local environment.'
          : 'No saved provider-backed Daily Five snapshot exists. Run npm run download:daily-five once; normal app startup will not spend provider credits.'
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
  const providerDailyScenario = dailyFiveProviderScenario(new Date().toISOString());
  let historicalDailyPack = savedHistoricalDailyPack;
  let historicalFailure: string | null = null;
  if (nansen) {
    try {
      historicalDailyPack = await createHistoricalDailyFiveCasePack(
        currentDayId,
        historicalAnchorDayStart,
        DAILY_FIVE_V2_RULES,
        providerDailyScenario,
        nansen,
      );
      writeDailyFiveSnapshot(dailyFiveSnapshotPath, historicalDailyPack);
      liveReason =
        'Nansen data is ready and saved locally. Daily Five will not request it again on restart.';
    } catch (error) {
      historicalFailure =
        error instanceof Error ? error.message : 'unknown historical collection error';
      liveReason =
        attemptLog.at(-1)?.error === 'credits'
          ? providerFailureReason()
          : `Nansen historical coverage is incomplete (${historicalFailure}). No synthetic data is published as Daily Five.`;
    }
    if (liveHuntEnabled) {
      try {
        const live = await collectLiveScenario(nansen);
        scenarios = [live];
        liveScenario = live;
        liveAvailable = true;
        liveReason =
          'Live Nansen data is ready. This one-round replay uses current 24h discovery metrics.';
      } catch {
        if (!historicalDailyPack) liveReason = providerFailureReason();
      }
    }
  }
  const practicePool =
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
  function authenticatedUser(request: FastifyRequest): string {
    if (request.cookies[AUTH_COOKIE] !== 'demo')
      throw new DailyFiveError('FORBIDDEN', 'Log in to continue.', 401);
    return 'demo';
  }
  app.post('/api/auth/login', async (request, reply) => {
    const { username, password } = authSchema.parse(request.body ?? {});
    if (username !== 'demo' || password !== 'demo')
      return reply.code(401).send({ message: 'Use the demo account demo / demo.' });
    reply.setCookie(AUTH_COOKIE, 'demo', {
      httpOnly: true,
      sameSite: 'lax',
      secure: production,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    return { username: 'demo', displayName: 'demo' };
  });
  app.get('/api/auth/me', async (request) => {
    authenticatedUser(request);
    return { username: 'demo', displayName: 'demo' };
  });
  app.post('/api/auth/logout', async (_request, reply) => {
    reply.clearCookie(AUTH_COOKIE, { path: '/' });
    return { ok: true };
  });
  function sessionId(request: FastifyRequest): string {
    const id = request.cookies[COOKIE];
    if (!id) throw new GameError('Start a session to enter the arena.', 401);
    game.session(id);
    return id;
  }
  const dailyFive = new DailyFiveEngine(db, {
    rules: DAILY_FIVE_V2_RULES,
    displayNameForPlayer: (playerId) =>
      playerId === 'demo' ? 'demo' : `player-${playerId.slice(0, 6)}`,
    ...(requestedMode === 'live'
      ? {
          privateAssetIdentityForKey: (key: string) => {
            const [chain, address] = key.split(':');
            const asset = DAILY_FIVE_PROVIDER_ASSETS.find(
              (candidate) =>
                candidate.chain.toLowerCase() === chain?.toLowerCase() &&
                candidate.address.toLowerCase() === address?.toLowerCase(),
            );
            return asset ? { name: asset.name, symbol: asset.symbol } : undefined;
          },
        }
      : {}),
    ...(requestedMode === 'live'
      ? {
          dayIdPrefix: dailyFiveDayIdPrefix,
          requiredCohort: DAILY_FIVE_PROVIDER_COHORT,
          publishedDailyId: historicalDailyPack?.publicChallenge.dailyId,
        }
      : {}),
    ...(historicalDailyPack
      ? {
          casePackFor: (dailyId: string, dayStart: number) =>
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
  const practice = new DailyFiveEngine(db, {
    rules: PRACTICE_RULES,
    displayNameForPlayer: (playerId) =>
      playerId === 'demo' ? 'demo' : `player-${playerId.slice(0, 6)}`,
    casePackFor: (dailyId: string, dayStart: number) =>
      createRandomPracticeCasePack(dailyId, dayStart, PRACTICE_RULES, practicePool),
    ...(requestedMode === 'live'
      ? {
          privateAssetIdentityForKey: (key: string) => {
            const [chain, address] = key.split(':');
            const asset = DAILY_FIVE_PROVIDER_ASSETS.find(
              (candidate) =>
                candidate.chain.toLowerCase() === chain?.toLowerCase() &&
                candidate.address.toLowerCase() === address?.toLowerCase(),
            );
            return asset ? { name: asset.name, symbol: asset.symbol } : undefined;
          },
        }
      : {}),
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
    engine: dailyFive,
    cookieName: AUTH_COOKIE,
    playerId: (request) => request.cookies[AUTH_COOKIE] ?? request.cookies[COOKIE],
  });
  app.get('/api/account/history', async (request) => dailyFive.history(authenticatedUser(request)));
  app.get('/api/leaderboards/all-time', async (request) => {
    authenticatedUser(request);
    return dailyFive.allTimeLeaderboard(100);
  });
  await registerDailyFiveRoutes(app, {
    engine: practice,
    routePrefix: '/api/practice',
    getToday: () => practice.practice(),
    defaultMode: 'practice',
    leaderboardEnabled: false,
    cookieName: AUTH_COOKIE,
    playerId: (request) => request.cookies[AUTH_COOKIE] ?? request.cookies[COOKIE],
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
    const root = resolve('dist');
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
