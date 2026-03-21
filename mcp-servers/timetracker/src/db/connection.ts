import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { runMigrations } from './schema.js';

const DB_PATH = process.env.TIMETRACKER_DB_PATH
  || path.join(process.env.HOME || '/tmp', '.nanoclaw', 'timetracker.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dir = path.dirname(DB_PATH);
    fs.mkdirSync(dir, { recursive: true });

    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');
    runMigrations(db);
  }
  return db;
}
