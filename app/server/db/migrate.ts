import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { openDatabase, SCHEMA_VERSION } from './store.js';

if (existsSync('.env')) loadEnvFile('.env');
if (existsSync('../.env')) loadEnvFile('../.env');
if (existsSync('../../.env')) loadEnvFile('../../.env');
const databasePath = process.env.DATABASE_PATH ?? './data/daily5.sqlite';
const db = openDatabase(databasePath);
db.close();
console.log(`Daily5 database ready at ${databasePath} (schema v${SCHEMA_VERSION}).`);
