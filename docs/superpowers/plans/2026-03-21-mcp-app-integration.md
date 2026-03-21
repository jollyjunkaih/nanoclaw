# MCP App Integration & Time Tracker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the NanoClaw container agent access to Apple Calendar, Apple Mail, and Structured (day planner) via MCP servers, plus a local time tracking web app with hourly check-in flow.

**Architecture:** Host-side MCP Gateway (port 3002) exposes per-app HTTP endpoints, each managing a stdio MCP backend. Container agent connects via `type: 'http'` config. Time tracker is a Next.js app (port 3003) with SQLite, sharing the DB with its MCP server.

**Tech Stack:** Node.js, TypeScript, `@modelcontextprotocol/sdk`, JXA (osascript), Apple Shortcuts CLI, Next.js 15, shadcn/ui, Tailwind CSS, `better-sqlite3`, Recharts

**Spec:** `docs/superpowers/specs/2026-03-21-mcp-app-integration-design.md`

---

## File Structure

```
nanoclaw/
├── mcp-servers/
│   ├── gateway/
│   │   ├── src/index.ts           -- HTTP server, per-endpoint stdio process management
│   │   ├── src/stdio-bridge.ts    -- Spawn & manage stdio MCP child processes
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── calendar/
│   │   ├── src/index.ts           -- MCP server entry (stdio)
│   │   ├── src/jxa.ts             -- JXA execution helper
│   │   ├── src/jxa/get-events.ts  -- JXA script: get events
│   │   ├── src/jxa/create-event.ts
│   │   ├── src/jxa/update-event.ts
│   │   ├── src/jxa/delete-event.ts
│   │   ├── src/jxa/get-calendars.ts
│   │   ├── src/jxa/check-availability.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── mail/
│   │   ├── src/index.ts           -- MCP server entry (stdio)
│   │   ├── src/jxa.ts             -- JXA execution helper (shared pattern)
│   │   ├── src/jxa/get-recent.ts
│   │   ├── src/jxa/search.ts
│   │   ├── src/jxa/get-email.ts
│   │   ├── src/jxa/send.ts
│   │   ├── src/jxa/reply.ts
│   │   ├── src/jxa/get-mailboxes.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── structured/
│   │   ├── src/index.ts           -- MCP server entry (stdio)
│   │   ├── src/shortcuts.ts       -- Shortcuts CLI helper
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── timetracker/
│       ├── src/
│       │   ├── app/
│       │   │   ├── layout.tsx
│       │   │   ├── page.tsx        -- Timesheet page
│       │   │   ├── reports/
│       │   │   │   └── page.tsx    -- Reports page
│       │   │   └── api/
│       │   │       ├── entries/route.ts   -- CRUD API for time entries
│       │   │       └── categories/route.ts
│       │   ├── components/
│       │   │   ├── timesheet-table.tsx
│       │   │   ├── entry-form.tsx
│       │   │   ├── date-picker.tsx
│       │   │   ├── report-charts.tsx
│       │   │   └── nav.tsx
│       │   ├── db/
│       │   │   ├── connection.ts   -- SQLite connection with WAL + busy_timeout
│       │   │   ├── schema.ts       -- Schema + migrations
│       │   │   └── queries.ts      -- Query functions
│       │   └── mcp/
│       │       └── index.ts        -- MCP server entry (stdio)
│       ├── package.json
│       ├── tailwind.config.ts
│       ├── tsconfig.json
│       └── next.config.ts
├── container/
│   └── agent-runner/
│       └── src/index.ts            -- MODIFY: add MCP server configs + allowedTools
└── config/
    └── launchd/                    -- launchd plist templates
        ├── com.nanoclaw.mcp-gateway.plist
        └── com.nanoclaw.timetracker.plist
```

---

### Task 1: Project Scaffolding & Shared Config

**Files:**
- Create: `mcp-servers/gateway/package.json`
- Create: `mcp-servers/gateway/tsconfig.json`
- Create: `mcp-servers/calendar/package.json`
- Create: `mcp-servers/calendar/tsconfig.json`
- Create: `mcp-servers/mail/package.json`
- Create: `mcp-servers/mail/tsconfig.json`
- Create: `mcp-servers/structured/package.json`
- Create: `mcp-servers/structured/tsconfig.json`

- [ ] **Step 1: Create gateway package.json**

```json
{
  "name": "nanoclaw-mcp-gateway",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.1",
    "express": "^5.1.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.7",
    "tsx": "^4.19.0",
    "typescript": "^5.7.3"
  }
}
```

- [ ] **Step 2: Create gateway tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create calendar package.json**

```json
{
  "name": "nanoclaw-mcp-calendar",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.12.1",
    "zod": "^4.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.7",
    "typescript": "^5.7.3"
  }
}
```

- [ ] **Step 4: Create calendar tsconfig.json** (same pattern as gateway)

- [ ] **Step 5: Create mail package.json** (same deps as calendar)

- [ ] **Step 6: Create mail tsconfig.json**

- [ ] **Step 7: Create structured package.json** (same deps as calendar)

- [ ] **Step 8: Create structured tsconfig.json**

- [ ] **Step 9: Install dependencies for all packages**

Run:
```bash
cd mcp-servers/gateway && npm install
cd ../calendar && npm install
cd ../mail && npm install
cd ../structured && npm install
```

- [ ] **Step 10: Commit**

```bash
git add mcp-servers/
git commit -m "feat: scaffold MCP server packages for calendar, mail, structured, gateway"
```

---

### Task 2: Validate Structured Shortcuts Actions

Before building the Structured MCP server, validate what's actually available.

- [ ] **Step 1: List available Structured shortcuts**

Run:
```bash
shortcuts list | grep -i structured
```

Document what actions are available. This determines the final tool set for the Structured MCP server.

- [ ] **Step 2: Test a Structured shortcut**

If a "Today's Schedule" or similar action exists:
```bash
shortcuts run "Today's Schedule" 2>&1
```

Document the output format.

- [ ] **Step 3: Document findings**

Create a note in `mcp-servers/structured/SHORTCUTS-DISCOVERY.md` listing:
- Available Shortcuts actions and their names
- Input/output formats
- Limitations (read-only? no task IDs? plain text only?)

Adjust the tool set in the plan accordingly. If read access is limited, the Structured MCP server becomes read-only (schedule display only).

- [ ] **Step 4: Commit**

```bash
git add mcp-servers/structured/SHORTCUTS-DISCOVERY.md
git commit -m "docs: document available Structured Shortcuts actions"
```

---

### Task 3: Time Tracker — Database Layer

**Files:**
- Create: `mcp-servers/timetracker/package.json`
- Create: `mcp-servers/timetracker/tsconfig.json`
- Create: `mcp-servers/timetracker/src/db/connection.ts`
- Create: `mcp-servers/timetracker/src/db/schema.ts`
- Create: `mcp-servers/timetracker/src/db/queries.ts`

- [ ] **Step 1: Initialize Next.js project**

```bash
cd mcp-servers
npx create-next-app@latest timetracker --typescript --tailwind --eslint --app --src-dir --no-import-alias
cd timetracker
```

Then configure port 3003 in `package.json` scripts:
```json
{
  "scripts": {
    "dev": "next dev -p 3003",
    "build": "next build",
    "start": "next start -p 3003"
  }
}
```

Also create a separate build script for the MCP server (independent of Next.js build). Add to `package.json`:
```json
{
  "scripts": {
    "build:mcp": "tsc --project tsconfig.mcp.json"
  }
}
```

Create `tsconfig.mcp.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src/mcp",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/mcp/**/*", "src/db/**/*"]
}
```

This ensures the MCP server compiles independently from Next.js. The gateway references `timetracker/dist/mcp.js`.

- [ ] **Step 2: Install additional dependencies**

```bash
npm install better-sqlite3 recharts @modelcontextprotocol/sdk zod
npm install -D @types/better-sqlite3
npx shadcn@latest init -d
npx shadcn@latest add button input table card tabs dialog select badge separator dropdown-menu
```

- [ ] **Step 3: Create database connection**

Create `mcp-servers/timetracker/src/db/connection.ts`:

```typescript
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
```

- [ ] **Step 4: Create schema and migrations**

Create `mcp-servers/timetracker/src/db/schema.ts`:

```typescript
import type Database from 'better-sqlite3';

const MIGRATIONS: string[] = [
  // v1: initial schema
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
```

- [ ] **Step 5: Create query functions**

Create `mcp-servers/timetracker/src/db/queries.ts`:

```typescript
import { getDb } from './connection.js';

export interface TimeEntry {
  id: number;
  date: string;
  start_time: string;
  end_time: string;
  activity: string;
  category_id: number | null;
  source: string;
  expected_activity: string | null;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: number;
  name: string;
  color: string | null;
}

export function logTime(entry: {
  date: string;
  start_time: string;
  end_time: string;
  activity: string;
  category_id?: number | null;
  source?: string;
  expected_activity?: string | null;
}): number {
  const db = getDb();
  const result = db.prepare(
    `INSERT INTO time_entries (date, start_time, end_time, activity, category_id, source, expected_activity)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    entry.date,
    entry.start_time,
    entry.end_time,
    entry.activity,
    entry.category_id ?? null,
    entry.source ?? 'agent',
    entry.expected_activity ?? null,
  );
  return Number(result.lastInsertRowid);
}

export function getTimesheet(date: string, endDate?: string): TimeEntry[] {
  const db = getDb();
  if (endDate) {
    return db.prepare(
      'SELECT * FROM time_entries WHERE date >= ? AND date <= ? ORDER BY date, start_time'
    ).all(date, endDate) as TimeEntry[];
  }
  return db.prepare(
    'SELECT * FROM time_entries WHERE date = ? ORDER BY start_time'
  ).all(date) as TimeEntry[];
}

export function updateEntry(
  id: number,
  updates: Partial<Pick<TimeEntry, 'activity' | 'start_time' | 'end_time' | 'category_id' | 'expected_activity'>>
): boolean {
  const db = getDb();
  const setClauses: string[] = [];
  const values: (string | number | null)[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      setClauses.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (setClauses.length === 0) return false;

  setClauses.push("updated_at = datetime('now')");
  values.push(id);

  const result = db.prepare(
    `UPDATE time_entries SET ${setClauses.join(', ')} WHERE id = ?`
  ).run(...values);

  return result.changes > 0;
}

export function deleteEntry(id: number): boolean {
  const db = getDb();
  const result = db.prepare('DELETE FROM time_entries WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getDailyReport(date: string): {
  entries: TimeEntry[];
  totalHours: number;
  byCategory: Record<string, number>;
} {
  const entries = getTimesheet(date);
  let totalMinutes = 0;
  const byCategory: Record<string, number> = {};

  for (const entry of entries) {
    const [sh, sm] = entry.start_time.split(':').map(Number);
    const [eh, em] = entry.end_time.split(':').map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    totalMinutes += mins;

    const cat = entry.category_id?.toString() ?? 'uncategorized';
    byCategory[cat] = (byCategory[cat] ?? 0) + mins;
  }

  return {
    entries,
    totalHours: Math.round(totalMinutes / 6) / 10,
    byCategory: Object.fromEntries(
      Object.entries(byCategory).map(([k, v]) => [k, Math.round(v / 6) / 10])
    ),
  };
}

export function getWeeklyReport(startDate: string): {
  days: Array<{ date: string; totalHours: number; entries: TimeEntry[] }>;
  totalHours: number;
} {
  const start = new Date(startDate);
  const days: Array<{ date: string; totalHours: number; entries: TimeEntry[] }> = [];
  let totalHours = 0;

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const report = getDailyReport(dateStr);
    days.push({ date: dateStr, totalHours: report.totalHours, entries: report.entries });
    totalHours += report.totalHours;
  }

  return { days, totalHours };
}

export function getMonthlyReport(month: string): {
  weeks: Array<{ startDate: string; totalHours: number }>;
  totalHours: number;
  byCategory: Record<string, number>;
} {
  const db = getDb();
  const entries = db.prepare(
    "SELECT * FROM time_entries WHERE date LIKE ? ORDER BY date, start_time"
  ).all(`${month}%`) as TimeEntry[];

  let totalMinutes = 0;
  const byCategory: Record<string, number> = {};
  const weekTotals: Record<string, number> = {};

  for (const entry of entries) {
    const [sh, sm] = entry.start_time.split(':').map(Number);
    const [eh, em] = entry.end_time.split(':').map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    totalMinutes += mins;

    const cat = entry.category_id?.toString() ?? 'uncategorized';
    byCategory[cat] = (byCategory[cat] ?? 0) + mins;

    const d = new Date(entry.date);
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - d.getDay());
    const weekKey = weekStart.toISOString().split('T')[0];
    weekTotals[weekKey] = (weekTotals[weekKey] ?? 0) + mins;
  }

  return {
    weeks: Object.entries(weekTotals).map(([startDate, mins]) => ({
      startDate,
      totalHours: Math.round(mins / 6) / 10,
    })),
    totalHours: Math.round(totalMinutes / 6) / 10,
    byCategory: Object.fromEntries(
      Object.entries(byCategory).map(([k, v]) => [k, Math.round(v / 6) / 10])
    ),
  };
}

// Category CRUD
export function getCategories(): Category[] {
  return getDb().prepare('SELECT * FROM categories ORDER BY name').all() as Category[];
}

export function createCategory(name: string, color?: string): number {
  const result = getDb().prepare(
    'INSERT INTO categories (name, color) VALUES (?, ?)'
  ).run(name, color ?? null);
  return Number(result.lastInsertRowid);
}
```

- [ ] **Step 6: Verify the DB layer works**

Run:
```bash
cd mcp-servers/timetracker
npx tsx -e "
  import { getDb } from './src/db/connection.js';
  const db = getDb();
  console.log('DB initialized, tables:', db.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all());
"
```
Expected: Tables listed including `time_entries`, `categories`, `schema_version`.

- [ ] **Step 7: Commit**

```bash
git add mcp-servers/timetracker/
git commit -m "feat: time tracker database layer with SQLite, WAL mode, migrations"
```

---

### Task 4: Time Tracker — MCP Server

**Files:**
- Create: `mcp-servers/timetracker/src/mcp/index.ts`

- [ ] **Step 1: Create the MCP server**

Create `mcp-servers/timetracker/src/mcp/index.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  logTime, getTimesheet, updateEntry, deleteEntry,
  getDailyReport, getWeeklyReport, getMonthlyReport,
  getCategories, createCategory
} from '../db/queries.js';

const server = new McpServer({
  name: 'timetracker',
  version: '1.0.0',
});

server.tool(
  'log_time',
  'Log a time entry. Used by the agent after hourly check-ins to record how time was spent.',
  {
    date: z.string().describe('Date in YYYY-MM-DD format'),
    start_time: z.string().describe('Start time in HH:MM format'),
    end_time: z.string().describe('End time in HH:MM format'),
    activity: z.string().describe('What was done during this time'),
    category: z.string().optional().describe('Category name (created if new)'),
    expected_activity: z.string().optional().describe('What was scheduled in Structured for this slot'),
  },
  async (args) => {
    let categoryId: number | null = null;
    if (args.category) {
      const cats = getCategories();
      const existing = cats.find(c => c.name.toLowerCase() === args.category!.toLowerCase());
      if (existing) {
        categoryId = existing.id;
      } else {
        categoryId = createCategory(args.category);
      }
    }

    const id = logTime({
      date: args.date,
      start_time: args.start_time,
      end_time: args.end_time,
      activity: args.activity,
      category_id: categoryId,
      source: 'agent',
      expected_activity: args.expected_activity,
    });

    return { content: [{ type: 'text' as const, text: `Time entry #${id} logged.` }] };
  },
);

server.tool(
  'get_timesheet',
  'Get time entries for a date or date range.',
  {
    date: z.string().describe('Start date in YYYY-MM-DD format'),
    end_date: z.string().optional().describe('End date for range query'),
  },
  async (args) => {
    const entries = getTimesheet(args.date, args.end_date);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(entries, null, 2) }],
    };
  },
);

server.tool(
  'update_entry',
  'Update an existing time entry.',
  {
    id: z.number().describe('Entry ID to update'),
    activity: z.string().optional(),
    start_time: z.string().optional(),
    end_time: z.string().optional(),
    category: z.string().optional(),
  },
  async (args) => {
    const updates: Record<string, string | number | null> = {};
    if (args.activity) updates.activity = args.activity;
    if (args.start_time) updates.start_time = args.start_time;
    if (args.end_time) updates.end_time = args.end_time;
    if (args.category) {
      const cats = getCategories();
      const existing = cats.find(c => c.name.toLowerCase() === args.category!.toLowerCase());
      updates.category_id = existing ? existing.id : createCategory(args.category);
    }

    const ok = updateEntry(args.id, updates);
    return {
      content: [{ type: 'text' as const, text: ok ? 'Entry updated.' : 'Entry not found.' }],
    };
  },
);

server.tool(
  'delete_entry',
  'Delete a time entry.',
  { id: z.number().describe('Entry ID to delete') },
  async (args) => {
    const ok = deleteEntry(args.id);
    return {
      content: [{ type: 'text' as const, text: ok ? 'Entry deleted.' : 'Entry not found.' }],
    };
  },
);

server.tool(
  'get_daily_report',
  'Get expected vs actual breakdown for a day. Shows total hours, category breakdown, and entries with expected activities.',
  { date: z.string().describe('Date in YYYY-MM-DD format') },
  async (args) => {
    const report = getDailyReport(args.date);
    return { content: [{ type: 'text' as const, text: JSON.stringify(report, null, 2) }] };
  },
);

server.tool(
  'get_weekly_report',
  'Get weekly report with daily totals and category breakdown.',
  { start_date: z.string().describe('Monday of the week in YYYY-MM-DD format') },
  async (args) => {
    const report = getWeeklyReport(args.start_date);
    return { content: [{ type: 'text' as const, text: JSON.stringify(report, null, 2) }] };
  },
);

server.tool(
  'get_monthly_report',
  'Get monthly report with weekly aggregates and category distribution.',
  { month: z.string().describe('Month in YYYY-MM format') },
  async (args) => {
    const report = getMonthlyReport(args.month);
    return { content: [{ type: 'text' as const, text: JSON.stringify(report, null, 2) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 2: Build and verify MCP server starts**

```bash
cd mcp-servers/timetracker
npx tsc --project tsconfig.json --outDir dist/mcp --rootDir src/mcp
# Or just verify it compiles
npx tsx src/mcp/index.ts --help 2>&1 || echo "Server started (expected to hang on stdin)"
```

- [ ] **Step 3: Commit**

```bash
git add mcp-servers/timetracker/src/mcp/
git commit -m "feat: time tracker MCP server with log, query, and report tools"
```

---

### Task 5: Apple Calendar MCP Server

**Files:**
- Create: `mcp-servers/calendar/src/jxa.ts`
- Create: `mcp-servers/calendar/src/jxa/get-events.ts`
- Create: `mcp-servers/calendar/src/jxa/create-event.ts`
- Create: `mcp-servers/calendar/src/jxa/update-event.ts`
- Create: `mcp-servers/calendar/src/jxa/delete-event.ts`
- Create: `mcp-servers/calendar/src/jxa/get-calendars.ts`
- Create: `mcp-servers/calendar/src/jxa/check-availability.ts`
- Create: `mcp-servers/calendar/src/index.ts`

- [ ] **Step 1: Create JXA execution helper**

Create `mcp-servers/calendar/src/jxa.ts`:

```typescript
import { execFile } from 'child_process';

export function runJxa(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('JXA script timed out after 30s'));
    }, 30_000);

    execFile('osascript', ['-l', 'JavaScript', '-e', script], {
      timeout: 30_000,
    }, (err, stdout, stderr) => {
      clearTimeout(timeout);
      if (err) reject(new Error(`JXA error: ${stderr || err.message}`));
      else resolve(stdout.trim());
    });
  });
}
```

- [ ] **Step 2: Create get-events JXA script**

Create `mcp-servers/calendar/src/jxa/get-events.ts`:

```typescript
// IMPORTANT: All user-supplied values MUST be sanitized with JSON.stringify()
// before interpolation into JXA scripts to prevent injection.

export function getEventsScript(date: string, endDate?: string, calendarName?: string): string {
  return `
    const app = Application('Calendar');
    const start = new Date(${JSON.stringify(date + 'T00:00:00')});
    const end = new Date(${JSON.stringify((endDate || date) + 'T23:59:59')});

    let calendars = app.calendars();
    ${calendarName ? `calendars = calendars.filter(c => c.name() === ${JSON.stringify(calendarName)});` : ''}

    const results = [];
    for (const cal of calendars) {
      const events = cal.events.whose({
        _and: [
          { startDate: { _greaterThan: start } },
          { startDate: { _lessThan: end } }
        ]
      })();

      for (const event of events) {
        results.push({
          id: event.uid(),
          title: event.summary(),
          start: event.startDate().toISOString(),
          end: event.endDate().toISOString(),
          location: event.location() || null,
          notes: event.description() || null,
          calendar: cal.name(),
          allDay: event.alldayEvent(),
        });
      }
    }

    JSON.stringify(results);
  `;
}
```

- [ ] **Step 3: Create create-event JXA script**

Create `mcp-servers/calendar/src/jxa/create-event.ts`:

```typescript
export function createEventScript(
  title: string, start: string, end: string,
  calendarName?: string, location?: string, notes?: string
): string {
  return `
    const app = Application('Calendar');
    const cal = ${calendarName
      ? `app.calendars.whose({ name: '${calendarName}' })[0]`
      : `app.defaultCalendar()`};

    const event = app.Event({
      summary: ${JSON.stringify(title)},
      startDate: new Date('${start}'),
      endDate: new Date('${end}'),
      ${location ? `location: ${JSON.stringify(location)},` : ''}
      ${notes ? `description: ${JSON.stringify(notes)},` : ''}
    });

    cal.events.push(event);
    JSON.stringify({ id: event.uid(), success: true });
  `;
}
```

- [ ] **Step 4: Create remaining JXA scripts**

Create `update-event.ts`, `delete-event.ts`, `get-calendars.ts`, `check-availability.ts` following the same pattern. Each exports a function that returns a JXA script string.

- [ ] **Step 5: Create Calendar MCP server entry**

Create `mcp-servers/calendar/src/index.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runJxa } from './jxa.js';
import { getEventsScript } from './jxa/get-events.js';
import { createEventScript } from './jxa/create-event.js';
import { getCalendarsScript } from './jxa/get-calendars.js';
import { checkAvailabilityScript } from './jxa/check-availability.js';
import { updateEventScript } from './jxa/update-event.js';
import { deleteEventScript } from './jxa/delete-event.js';

const server = new McpServer({ name: 'calendar', version: '1.0.0' });

server.tool(
  'get_events',
  'Get calendar events for a date or date range.',
  {
    date: z.string().describe('Start date YYYY-MM-DD'),
    end_date: z.string().optional().describe('End date YYYY-MM-DD (defaults to same day)'),
    calendar: z.string().optional().describe('Filter to specific calendar name'),
  },
  async (args) => {
    const result = await runJxa(getEventsScript(args.date, args.end_date, args.calendar));
    return { content: [{ type: 'text' as const, text: result }] };
  },
);

server.tool(
  'create_event',
  'Create a new calendar event.',
  {
    title: z.string(),
    start: z.string().describe('ISO 8601 datetime'),
    end: z.string().describe('ISO 8601 datetime'),
    calendar: z.string().optional(),
    location: z.string().optional(),
    notes: z.string().optional(),
  },
  async (args) => {
    const result = await runJxa(createEventScript(
      args.title, args.start, args.end, args.calendar, args.location, args.notes
    ));
    return { content: [{ type: 'text' as const, text: result }] };
  },
);

server.tool(
  'update_event',
  'Update an existing calendar event.',
  {
    event_id: z.string(),
    title: z.string().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
    location: z.string().optional(),
    notes: z.string().optional(),
  },
  async (args) => {
    const result = await runJxa(updateEventScript(
      args.event_id, args.title, args.start, args.end, args.location, args.notes
    ));
    return { content: [{ type: 'text' as const, text: result }] };
  },
);

server.tool(
  'delete_event',
  'Delete a calendar event.',
  { event_id: z.string() },
  async (args) => {
    const result = await runJxa(deleteEventScript(args.event_id));
    return { content: [{ type: 'text' as const, text: result }] };
  },
);

server.tool(
  'get_calendars',
  'List all available calendars.',
  {},
  async () => {
    const result = await runJxa(getCalendarsScript());
    return { content: [{ type: 'text' as const, text: result }] };
  },
);

server.tool(
  'check_availability',
  'Find free time slots in a day.',
  {
    date: z.string().describe('Date YYYY-MM-DD'),
    start_time: z.string().optional().describe('Start of window HH:MM (default 09:00)'),
    end_time: z.string().optional().describe('End of window HH:MM (default 17:00)'),
  },
  async (args) => {
    const result = await runJxa(checkAvailabilityScript(
      args.date, args.start_time, args.end_time
    ));
    return { content: [{ type: 'text' as const, text: result }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 6: Test get_calendars locally**

```bash
cd mcp-servers/calendar
npx tsx -e "
  import { runJxa } from './src/jxa.js';
  const result = await runJxa(\`
    const app = Application('Calendar');
    JSON.stringify(app.calendars().map(c => ({ name: c.name(), id: c.uid() })));
  \`);
  console.log(result);
"
```

Expected: JSON array of calendar names. If a permission dialog appears, approve it.

- [ ] **Step 7: Commit**

```bash
git add mcp-servers/calendar/
git commit -m "feat: Apple Calendar MCP server with JXA backend"
```

---

### Task 6: Apple Mail MCP Server

**Files:**
- Create: `mcp-servers/mail/src/jxa.ts` (copy from calendar)
- Create: `mcp-servers/mail/src/jxa/get-recent.ts`
- Create: `mcp-servers/mail/src/jxa/search.ts`
- Create: `mcp-servers/mail/src/jxa/get-email.ts`
- Create: `mcp-servers/mail/src/jxa/send.ts`
- Create: `mcp-servers/mail/src/jxa/reply.ts`
- Create: `mcp-servers/mail/src/jxa/get-mailboxes.ts`
- Create: `mcp-servers/mail/src/index.ts`

- [ ] **Step 1: Copy JXA helper from calendar**

```bash
cp mcp-servers/calendar/src/jxa.ts mcp-servers/mail/src/jxa.ts
```

- [ ] **Step 2: Create get-recent JXA script**

Create `mcp-servers/mail/src/jxa/get-recent.ts`:

```typescript
export function getRecentEmailsScript(limit: number = 20, mailbox?: string, unreadOnly?: boolean): string {
  return `
    const app = Application('Mail');
    let messages;

    ${mailbox ? `
    const mb = app.mailboxes.whose({ name: '${mailbox}' })[0];
    messages = mb.messages();
    ` : `
    messages = app.inbox.messages();
    `}

    ${unreadOnly ? `messages = messages.filter(m => !m.readStatus());` : ''}

    const results = messages.slice(0, ${limit}).map(m => ({
      id: m.id(),
      subject: m.subject(),
      sender: m.sender(),
      date: m.dateReceived().toISOString(),
      snippet: m.content().substring(0, 200),
      read: m.readStatus(),
    }));

    JSON.stringify(results);
  `;
}
```

- [ ] **Step 3: Create remaining mail JXA scripts**

Create `search.ts`, `get-email.ts`, `send.ts`, `reply.ts`, `get-mailboxes.ts` following the same pattern.

- [ ] **Step 4: Create Mail MCP server entry**

Create `mcp-servers/mail/src/index.ts` following the same pattern as calendar, registering all 6 tools.

- [ ] **Step 5: Test get_mailboxes locally**

```bash
cd mcp-servers/mail
npx tsx -e "
  import { runJxa } from './src/jxa.js';
  const result = await runJxa(\`
    const app = Application('Mail');
    JSON.stringify(app.accounts().flatMap(a =>
      a.mailboxes().map(mb => ({ name: mb.name(), account: a.name() }))
    ));
  \`);
  console.log(result);
"
```

- [ ] **Step 6: Commit**

```bash
git add mcp-servers/mail/
git commit -m "feat: Apple Mail MCP server with JXA backend"
```

---

### Task 7: Structured MCP Server

**Files:**
- Create: `mcp-servers/structured/src/shortcuts.ts`
- Create: `mcp-servers/structured/src/index.ts`

*Note: The tool set depends on Task 2 findings. The code below is aspirational — adjust based on what Shortcuts actions Structured actually exposes.*

- [ ] **Step 1: Create Shortcuts CLI helper**

Create `mcp-servers/structured/src/shortcuts.ts`:

```typescript
import { execFile } from 'child_process';

export function runShortcut(name: string, input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const args = ['run', name];
    if (input) {
      args.push('-i', input);
    }

    execFile('shortcuts', args, { timeout: 30_000 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`Shortcut "${name}" failed: ${stderr || err.message}`));
      else resolve(stdout.trim());
    });
  });
}
```

- [ ] **Step 2: Create Structured MCP server**

Create `mcp-servers/structured/src/index.ts`:

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runShortcut } from './shortcuts.js';

const server = new McpServer({ name: 'structured', version: '1.0.0' });

// Tool names here must match actual Structured Shortcuts actions.
// Adjust based on Task 2 discovery.

server.tool(
  'get_today_schedule',
  "Get today's schedule from Structured day planner.",
  {},
  async () => {
    try {
      // The actual shortcut name must match what Structured registers.
      // Common names: "Today's Schedule", "Structured - Today"
      const result = await runShortcut("Today's Schedule");
      return { content: [{ type: 'text' as const, text: result || 'No schedule found.' }] };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Failed to get schedule: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
);

server.tool(
  'add_task',
  'Add a task to Structured.',
  {
    title: z.string().describe('Task title'),
    start_time: z.string().optional().describe('Start time HH:MM'),
    duration: z.number().optional().describe('Duration in minutes'),
  },
  async (args) => {
    try {
      const input = JSON.stringify(args);
      const result = await runShortcut('Add to Structured', input);
      return { content: [{ type: 'text' as const, text: result || 'Task added.' }] };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Failed to add task: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 3: Build and test**

```bash
cd mcp-servers/structured
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add mcp-servers/structured/
git commit -m "feat: Structured MCP server with Shortcuts CLI bridge"
```

---

### Task 8: MCP Gateway

**Files:**
- Create: `mcp-servers/gateway/src/index.ts`
- Create: `mcp-servers/gateway/src/stdio-bridge.ts`

- [ ] **Step 1: Create stdio bridge**

Create `mcp-servers/gateway/src/stdio-bridge.ts`:

```typescript
import { spawn, ChildProcess } from 'child_process';
import path from 'path';

export interface ServerConfig {
  command: string;
  args: string[];
  cwd?: string;
}

export interface StdioBridge {
  process: ChildProcess;
  send(data: string): void;
  onData(cb: (data: string) => void): void;
  kill(): void;
  isAlive(): boolean;
}

export function spawnStdioServer(config: ServerConfig): StdioBridge {
  const proc = spawn(config.command, config.args, {
    cwd: config.cwd,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  let alive = true;
  proc.on('exit', () => { alive = false; });
  proc.on('error', () => { alive = false; });

  // Log stderr for debugging
  proc.stderr?.on('data', (data: Buffer) => {
    console.error(`[${config.args[config.args.length - 1]}] ${data.toString().trim()}`);
  });

  return {
    process: proc,
    send(data: string) {
      proc.stdin?.write(data);
    },
    onData(cb: (data: string) => void) {
      proc.stdout?.on('data', (chunk: Buffer) => cb(chunk.toString()));
    },
    kill() {
      proc.kill();
      alive = false;
    },
    isAlive() {
      return alive;
    },
  };
}
```

- [ ] **Step 2: Create MCP Gateway server**

Create `mcp-servers/gateway/src/index.ts`:

This is the core component. For each backend, it creates a proxy `McpServer` that:
1. Lazy-spawns the stdio backend via `StdioClientTransport` + `Client`
2. Discovers the backend's tools via `client.listTools()`
3. Registers matching proxy tools on the `McpServer` that forward calls to the backend
4. Exposes each as a Streamable HTTP endpoint

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GATEWAY_PORT = parseInt(process.env.MCP_GATEWAY_PORT || '3002', 10);

interface BackendConfig {
  command: string;
  args: string[];
  cwd: string;
}

const serversDir = path.resolve(__dirname, '../../');
const BACKENDS: Record<string, BackendConfig> = {
  calendar: {
    command: 'node',
    args: [path.join(serversDir, 'calendar', 'dist', 'index.js')],
    cwd: path.join(serversDir, 'calendar'),
  },
  mail: {
    command: 'node',
    args: [path.join(serversDir, 'mail', 'dist', 'index.js')],
    cwd: path.join(serversDir, 'mail'),
  },
  structured: {
    command: 'node',
    args: [path.join(serversDir, 'structured', 'dist', 'index.js')],
    cwd: path.join(serversDir, 'structured'),
  },
  timetracker: {
    command: 'node',
    args: [path.join(serversDir, 'timetracker', 'dist', 'mcp.js')],
    cwd: path.join(serversDir, 'timetracker'),
  },
};

// Lazy-spawned MCP clients to backends
const clients: Map<string, Client> = new Map();

async function getOrSpawnClient(name: string): Promise<Client> {
  const existing = clients.get(name);
  if (existing) return existing;

  const config = BACKENDS[name];
  if (!config) throw new Error(`Unknown backend: ${name}`);

  console.log(`[gateway] Spawning backend: ${name}`);
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    cwd: config.cwd,
  });

  const client = new Client({ name: `gateway-${name}`, version: '1.0.0' });
  await client.connect(transport);

  // Auto-restart on close
  transport.onclose = () => {
    console.log(`[gateway] Backend ${name} closed, will respawn on next request`);
    clients.delete(name);
  };

  clients.set(name, client);
  return client;
}

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    backends: Object.keys(BACKENDS),
    connected: Array.from(clients.keys()),
  });
});

// For each backend, expose a Streamable HTTP endpoint that proxies to stdio
for (const name of Object.keys(BACKENDS)) {
  // MCP Streamable HTTP: POST /{name}/mcp for JSON-RPC requests
  app.post(`/${name}/mcp`, async (req, res) => {
    try {
      const client = await getOrSpawnClient(name);
      const jsonRpcRequest = req.body;

      // Route JSON-RPC methods to the backend client
      let result: unknown;

      if (jsonRpcRequest.method === 'tools/list') {
        result = await client.listTools();
      } else if (jsonRpcRequest.method === 'tools/call') {
        const { name: toolName, arguments: toolArgs } = jsonRpcRequest.params;
        result = await client.callTool({ name: toolName, arguments: toolArgs });
      } else if (jsonRpcRequest.method === 'initialize') {
        // Return gateway's server info
        result = {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name, version: '1.0.0' },
        };
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          id: jsonRpcRequest.id,
          error: { code: -32601, message: `Method not supported: ${jsonRpcRequest.method}` },
        });
        return;
      }

      res.json({
        jsonrpc: '2.0',
        id: jsonRpcRequest.id,
        result,
      });
    } catch (err) {
      console.error(`[gateway] Error proxying to ${name}:`, err);
      // Reset client on error so it respawns
      clients.delete(name);
      res.status(500).json({
        jsonrpc: '2.0',
        id: req.body?.id,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : String(err),
        },
      });
    }
  });

  console.log(`[gateway] Registered: /${name}/mcp`);
}

app.listen(GATEWAY_PORT, '127.0.0.1', () => {
  console.log(`MCP Gateway listening on http://127.0.0.1:${GATEWAY_PORT}`);
  console.log(`Backends: ${Object.keys(BACKENDS).join(', ')}`);
});
```

**Implementation notes:**
- The gateway proxies JSON-RPC requests from the container agent to the stdio backend via the MCP SDK's `Client` class.
- `StdioClientTransport` manages the child process lifecycle. The `onclose` handler auto-removes dead clients so they respawn on next request.
- If the Claude Agent SDK's `type: 'http'` config sends standard MCP JSON-RPC over HTTP, this works directly. If the SDK uses a different wire format (e.g., Streamable HTTP with SSE streaming), the gateway must use `StreamableHTTPServerTransport` instead of raw express handlers. Verify during implementation by inspecting what HTTP requests the SDK actually sends. The express handler above is the simpler approach; swap to `StreamableHTTPServerTransport` if needed.

- [ ] **Step 3: Build gateway**

```bash
cd mcp-servers/gateway
npm run build
```

- [ ] **Step 4: Test gateway starts**

```bash
cd mcp-servers/gateway
node dist/index.js &
curl http://127.0.0.1:3002/health
kill %1
```

Expected: `{"status":"ok","backends":["calendar","mail","structured","timetracker"]}`

- [ ] **Step 5: Commit**

```bash
git add mcp-servers/gateway/
git commit -m "feat: MCP Gateway with per-endpoint HTTP-to-stdio proxying"
```

---

### Task 9: Container Agent Integration

**Files:**
- Modify: `container/agent-runner/src/index.ts:393-433`

- [ ] **Step 1: Read the current agent runner to verify exact location**

Read `container/agent-runner/src/index.ts` lines 393-433 to confirm the `query()` call location and current `mcpServers` + `allowedTools` config.

- [ ] **Step 2: Add MCP server configs to the query options**

In `container/agent-runner/src/index.ts`, read the gateway URL from environment (set by the host's container runner) and add MCP server configs:

```typescript
// Near the top of main(), after parsing containerInput:
const mcpGatewayUrl = process.env.MCP_GATEWAY_URL; // e.g., http://host.docker.internal:3002

// Then in the query() options:
mcpServers: {
  nanoclaw: {
    command: 'node',
    args: [mcpServerPath],
    env: {
      NANOCLAW_CHAT_JID: containerInput.chatJid,
      NANOCLAW_GROUP_FOLDER: containerInput.groupFolder,
      NANOCLAW_IS_MAIN: containerInput.isMain ? '1' : '0',
    },
  },
  // Only add gateway servers if the URL is configured
  ...(mcpGatewayUrl ? {
    calendar: {
      type: 'http' as const,
      url: `${mcpGatewayUrl}/calendar/mcp`,
    },
    mail: {
      type: 'http' as const,
      url: `${mcpGatewayUrl}/mail/mcp`,
    },
    structured: {
      type: 'http' as const,
      url: `${mcpGatewayUrl}/structured/mcp`,
    },
    timetracker: {
      type: 'http' as const,
      url: `${mcpGatewayUrl}/timetracker/mcp`,
    },
  } : {}),
},
```

- [ ] **Step 3: Add allowed tool patterns**

Add to the `allowedTools` array:
```typescript
'mcp__calendar__*',
'mcp__mail__*',
'mcp__structured__*',
'mcp__timetracker__*',
```

- [ ] **Step 4: Pass gateway URL to the container**

In `src/container-runner.ts`, in the `buildContainerArgs()` function, add the MCP gateway URL as an environment variable (near the existing `ANTHROPIC_BASE_URL` line):

```typescript
// MCP Gateway for host-side app integrations (Calendar, Mail, etc.)
args.push('-e', `MCP_GATEWAY_URL=http://${CONTAINER_HOST_GATEWAY}:3002`);
```

This uses the existing `CONTAINER_HOST_GATEWAY` constant (which resolves to `host.docker.internal` on macOS or the docker0 bridge IP on Linux). The agent runner reads this via `process.env.MCP_GATEWAY_URL`.

- [ ] **Step 5: Rebuild the container**

```bash
./container/build.sh
```

- [ ] **Step 6: Commit**

```bash
git add container/agent-runner/src/index.ts src/container-runner.ts
git commit -m "feat: connect container agent to host MCP gateway for calendar, mail, structured, timetracker"
```

---

### Task 10: Time Tracker — Web App UI

**Files:**
- Modify: `mcp-servers/timetracker/src/app/layout.tsx`
- Create: `mcp-servers/timetracker/src/app/page.tsx` (overwrite default)
- Create: `mcp-servers/timetracker/src/app/reports/page.tsx`
- Create: `mcp-servers/timetracker/src/app/api/entries/route.ts`
- Create: `mcp-servers/timetracker/src/app/api/categories/route.ts`
- Create: `mcp-servers/timetracker/src/components/timesheet-table.tsx`
- Create: `mcp-servers/timetracker/src/components/entry-form.tsx`
- Create: `mcp-servers/timetracker/src/components/report-charts.tsx`
- Create: `mcp-servers/timetracker/src/components/nav.tsx`

- [ ] **Step 1: Create API routes for entries**

Create `mcp-servers/timetracker/src/app/api/entries/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { logTime, getTimesheet, updateEntry, deleteEntry } from '@/db/queries';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
  const endDate = searchParams.get('end_date') || undefined;
  const entries = getTimesheet(date, endDate);
  return NextResponse.json(entries);
}

export async function POST(request: Request) {
  const body = await request.json();
  const id = logTime({
    date: body.date,
    start_time: body.start_time,
    end_time: body.end_time,
    activity: body.activity,
    category_id: body.category_id,
    source: 'manual',
    expected_activity: body.expected_activity,
  });
  return NextResponse.json({ id });
}

export async function PUT(request: Request) {
  const body = await request.json();
  const ok = updateEntry(body.id, body);
  return NextResponse.json({ success: ok });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = parseInt(searchParams.get('id') || '0', 10);
  const ok = deleteEntry(id);
  return NextResponse.json({ success: ok });
}
```

- [ ] **Step 2: Create API routes for categories**

Create `mcp-servers/timetracker/src/app/api/categories/route.ts` with GET and POST handlers.

- [ ] **Step 3: Create navigation component**

Create `mcp-servers/timetracker/src/components/nav.tsx`:
- Links to `/` (Timesheet) and `/reports` (Reports)
- Simple top bar with shadcn navigation

- [ ] **Step 4: Update layout.tsx**

Update `mcp-servers/timetracker/src/app/layout.tsx` to include the Nav component and set the page title to "Time Tracker".

- [ ] **Step 5: Create timesheet table component**

Create `mcp-servers/timetracker/src/components/timesheet-table.tsx`:
- Uses shadcn Table component
- Columns: Time (start-end), Activity, Expected, Category, Source, Actions
- Inline edit via dialog
- Delete with confirmation
- Fetches from `/api/entries?date=YYYY-MM-DD`

- [ ] **Step 6: Create entry form component**

Create `mcp-servers/timetracker/src/components/entry-form.tsx`:
- Form with: date, start time, end time, activity, category (select)
- Posts to `/api/entries`
- Uses shadcn Input, Select, Button

- [ ] **Step 7: Create timesheet page**

Overwrite `mcp-servers/timetracker/src/app/page.tsx`:
- Date picker at top (defaults to today)
- TimesheetTable component
- EntryForm component below the table
- Shows total hours for the day

- [ ] **Step 8: Create report charts component**

Create `mcp-servers/timetracker/src/components/report-charts.tsx`:
- Uses Recharts (BarChart, PieChart)
- Expected vs actual bar chart
- Category breakdown pie/donut chart
- Accepts data as props

- [ ] **Step 9: Create reports page**

Create `mcp-servers/timetracker/src/app/reports/page.tsx`:
- Tab toggle: Daily / Weekly / Monthly (shadcn Tabs)
- Date/week/month picker
- Fetches data from `/api/entries` with appropriate date range
- Renders ReportCharts component
- Shows summary stats (total hours, categories)

- [ ] **Step 10: Test the web app**

```bash
cd mcp-servers/timetracker
npm run dev
```

Open `http://localhost:3003` in browser. Verify:
- Timesheet page loads
- Can add a time entry
- Can edit/delete entries
- Reports page loads
- Charts render with sample data

- [ ] **Step 11: Commit**

```bash
git add mcp-servers/timetracker/
git commit -m "feat: time tracker web app with timesheet and reports pages"
```

---

### Task 11: Process Management (launchd)

**Files:**
- Create: `config/launchd/com.nanoclaw.mcp-gateway.plist`
- Create: `config/launchd/com.nanoclaw.timetracker.plist`

- [ ] **Step 1: Create MCP Gateway launchd plist**

Create `config/launchd/com.nanoclaw.mcp-gateway.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.nanoclaw.mcp-gateway</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/node</string>
    <string>__NANOCLAW_DIR__/mcp-servers/gateway/dist/index.js</string>
  </array>
  <key>WorkingDirectory</key>
  <string>__NANOCLAW_DIR__/mcp-servers/gateway</string>
  <key>KeepAlive</key>
  <true/>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>__NANOCLAW_DIR__/data/logs/mcp-gateway.log</string>
  <key>StandardErrorPath</key>
  <string>__NANOCLAW_DIR__/data/logs/mcp-gateway.err</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>MCP_GATEWAY_PORT</key>
    <string>3002</string>
    <key>PATH</key>
    <string>/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
```

- [ ] **Step 2: Create Time Tracker launchd plist**

Create `config/launchd/com.nanoclaw.timetracker.plist` — same pattern, running `npm start` in the timetracker directory on port 3003.

- [ ] **Step 3: Create install script**

Create `mcp-servers/install-services.sh`:

```bash
#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
NANOCLAW_DIR="$(dirname "$SCRIPT_DIR")"
LAUNCH_AGENTS="$HOME/Library/LaunchAgents"

mkdir -p "$LAUNCH_AGENTS"
mkdir -p "$NANOCLAW_DIR/data/logs"

for plist in "$NANOCLAW_DIR/config/launchd"/com.nanoclaw.mcp-*.plist "$NANOCLAW_DIR/config/launchd"/com.nanoclaw.timetracker.plist; do
  [ -f "$plist" ] || continue
  name=$(basename "$plist")
  sed "s|__NANOCLAW_DIR__|$NANOCLAW_DIR|g" "$plist" > "$LAUNCH_AGENTS/$name"
  launchctl load "$LAUNCH_AGENTS/$name" 2>/dev/null || true
  echo "Installed $name"
done
```

- [ ] **Step 4: Commit**

```bash
git add config/launchd/ mcp-servers/install-services.sh
git commit -m "feat: launchd plists and install script for MCP gateway and time tracker"
```

---

### Task 12: Hourly Check-in Scheduled Task

This task sets up the agent's CLAUDE.md instructions for the check-in flow. The actual scheduling happens when the agent first runs — it uses the existing `schedule_task` MCP tool.

**Files:**
- Modify: Group's CLAUDE.md (the main group's memory file)

- [ ] **Step 1: Add time tracking instructions to the group's CLAUDE.md**

Add a section to the main group's CLAUDE.md that instructs the agent:

```markdown
## Time Tracking

You have access to these MCP tools for daily planning and time tracking:
- `mcp__calendar__*` — Apple Calendar (read events, create events, check availability)
- `mcp__mail__*` — Apple Mail (read, search, send emails)
- `mcp__structured__*` — Structured day planner (read schedule, add tasks)
- `mcp__timetracker__*` — Time tracker (log time, get reports)

### Hourly Check-in Flow
A scheduled task runs at the top of each hour during working hours (9am-6pm).
When it fires:
1. Call `mcp__structured__get_today_schedule` to get what was planned for the previous hour
2. Send a Telegram message asking how the user spent their time, pre-populated with the Structured schedule
3. When the user replies, call `mcp__timetracker__log_time` with their response and the expected activity

If the user didn't reply to the previous hour's check-in, note the gap.

### End of Day Report
At 6pm, call `mcp__timetracker__get_daily_report` and send a summary comparing planned vs actual time.

### Time Tracker Web App
The user can view and edit their timesheet at http://localhost:3003
```

- [ ] **Step 2: Set up the hourly check-in scheduled task**

Via the NanoClaw agent (or manually via the agent), schedule the task:

```
Schedule a task with cron "0 9-18 * * 1-5" (weekdays 9am-6pm, top of hour) with this prompt:

"Check the Structured schedule for the previous hour using mcp__structured__get_today_schedule. Then send a check-in message via Telegram asking how I spent my time, pre-populated with what was scheduled. If I didn't reply to the previous check-in, note the gap."

Use context_mode: group so you have conversation history.
```

- [ ] **Step 3: Set up the end-of-day report task**

```
Schedule a task with cron "0 18 * * 1-5" (weekdays at 6pm) with this prompt:

"Get today's time tracking report using mcp__timetracker__get_daily_report with today's date. Send a summary comparing the Structured schedule (expected) vs actual time logged. Note any unlogged hours."

Use context_mode: group.
```

- [ ] **Step 4: Commit**

```bash
git add groups/
git commit -m "feat: add time tracking instructions and scheduled check-in tasks"
```

---

### Task 13: Build Everything & End-to-End Test

- [ ] **Step 1: Build all MCP servers**

```bash
cd mcp-servers/calendar && npm run build
cd ../mail && npm run build
cd ../structured && npm run build
cd ../timetracker && npm run build
cd ../gateway && npm run build
```

- [ ] **Step 2: Start the gateway**

```bash
cd mcp-servers/gateway && node dist/index.js &
```

Verify health: `curl http://127.0.0.1:3002/health`

- [ ] **Step 3: Start the time tracker web app**

```bash
cd mcp-servers/timetracker && npm run dev &
```

Open http://localhost:3003 — verify it loads.

- [ ] **Step 4: Test Calendar MCP through gateway**

Manually test that the gateway can proxy to the calendar backend. Use the MCP SDK's client to call `get_calendars` through the gateway endpoint.

- [ ] **Step 5: Rebuild container and test agent**

```bash
./container/build.sh
```

Send a test message to the agent via Telegram asking it to "list my calendars" or "what's on my calendar today". Verify it successfully calls `mcp__calendar__get_events`.

- [ ] **Step 6: Test time tracking flow**

Send a message: "Log that I spent 9am-10am on 'project planning' today"
Verify:
- Agent calls `mcp__timetracker__log_time`
- Entry appears in the web app at localhost:3003

- [ ] **Step 7: Install launchd services**

```bash
chmod +x mcp-servers/install-services.sh
./mcp-servers/install-services.sh
```

Verify services are running:
```bash
launchctl list | grep nanoclaw
```

- [ ] **Step 8: Final commit**

```bash
git add -A
git commit -m "feat: complete MCP app integration with calendar, mail, structured, time tracker"
```

---

## Important Notes

### macOS Permissions

First-time access to Calendar and Mail via JXA will trigger macOS permission dialogs. Before running the MCP servers, you may need to grant:

1. **System Settings → Privacy & Security → Automation**: Allow Terminal (or Node.js) to control Calendar.app and Mail.app
2. **System Settings → Privacy & Security → Calendars**: Allow the app to access calendars
3. **System Settings → Privacy & Security → Full Disk Access**: May be needed for Mail if access is denied

If a JXA script silently fails or returns empty results, check these permissions first.

### WhatsApp Removal

WhatsApp removal is a separate task, not part of this plan. Handle it independently.
