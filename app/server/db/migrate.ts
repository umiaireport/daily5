import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { openDatabase, SCHEMA_VERSION } from './store.js';

if (existsSync('.env')) loadEnvFile('.env');
if (existsSync('../.env')) loadEnvFile('../.env');
if (existsSync('../../.env')) loadEnvFile('../../.env');
const databasePath = process.env.DATABASE_PATH ?? './data/whale-arena.sqlite';
const db = openDatabase(databasePath);
db.close();
console.log(
  `Whale Arena database ready at ${databasePath} (schema v${SCHEMA_VERSION}; additive game tables ready).`,
);
