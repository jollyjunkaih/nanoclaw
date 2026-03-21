import type Database from 'better-sqlite3';

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS categories (
    id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name  TEXT UNIQUE NOT NULL,
    color TEXT
  );

  CREATE TABLE IF NOT EXISTS time_entries (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    date              TEXT NOT NULL,
    start_time        TEXT NOT NULL,
    end_time          TEXT NOT NULL,
    activity          TEXT NOT NULL,
    category_id       INTEGER REFERENCES categories(id),
    source            TEXT DEFAULT 'agent',
    expected_activity TEXT,
    created_at        TEXT DEFAULT (datetime('now')),
    updated_at        TEXT DEFAULT (datetime('now')),
    CHECK (end_time > start_time)
  );

  CREATE INDEX IF NOT EXISTS idx_entries_date ON time_entries(date);

  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER PRIMARY KEY
  );
  INSERT INTO schema_version (version) VALUES (1);`,
];

export function runMigrations(db: Database.Database): void {
  const currentVersion = (() => {
    try {
      const row = db.prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1').get() as { version: number } | undefined;
      return row?.version ?? 0;
    } catch {
      return 0;
    }
  })();

  for (let i = currentVersion; i < MIGRATIONS.length; i++) {
    db.exec(MIGRATIONS[i]);
  }
}
