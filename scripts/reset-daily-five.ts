import { existsSync } from 'node:fs';
import { loadEnvFile } from 'node:process';
import { openDatabase } from '../server/db/store.js';
import { resetDailyFiveState } from '../server/db/daily-five.js';

if (existsSync('.env')) loadEnvFile('.env');
if (existsSync('../.env')) loadEnvFile('../.env');
if (existsSync('../../.env')) loadEnvFile('../../.env');

if (process.env.NODE_ENV === 'production')
  throw new Error('reset:daily-five is development-only and refuses NODE_ENV=production.');

const databasePath = process.env.DATABASE_PATH ?? './data/whale-arena.sqlite';
const db = openDatabase(databasePath);
try {
  const counts = resetDailyFiveState(db);
  console.log(`Reset local Daily Five state in ${databasePath}.`);
  console.log(JSON.stringify(counts));
  console.log('Refresh the browser to open a new official attempt for the preserved case pack.');
} finally {
  db.close();
}
