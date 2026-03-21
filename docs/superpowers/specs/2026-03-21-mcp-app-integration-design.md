# MCP App Integration & Time Tracker — Design Spec

**Date:** 2026-03-21
**Status:** Approved

## Overview

Add MCP servers to NanoClaw that give the container agent direct access to macOS applications (Apple Calendar, Apple Mail, Structured) and a local time tracking system. This enables the agent to help plan the user's day, track time via hourly Telegram check-ins, and generate expected-vs-actual reports.

## Goals

1. Agent can read/write Apple Calendar events
2. Agent can read/search/send Apple Mail
3. Agent can read/add tasks in Structured (day planner app)
4. Local time tracking app with web UI for editing timesheets and viewing reports
5. Hourly check-in flow: agent asks via Telegram how time was spent, logs it
6. End-of-day report comparing Structured schedule (expected) vs actual time logged

## Architecture

```
┌─────────────────────────────────────────────────┐
│  Container (Linux VM)                           │
│  ┌───────────────────────────────────────────┐  │
│  │  Claude Agent (SDK)                       │  │
│  │  - mcp__nanoclaw__* (existing, stdio)     │  │
│  │  - mcp__calendar__*  ─┐                   │  │
│  │  - mcp__mail__*       ├─ via HTTP gateway │  │
│  │  - mcp__structured__* │                   │  │
│  │  - mcp__timetracker__*┘                   │  │
│  └──────────────┬────────────────────────────┘  │
│                 │ HTTP (host gateway)            │
└─────────────────┼───────────────────────────────┘
                  │
┌─────────────────┼───────────────────────────────┐
│  macOS Host     │                               │
│                 ▼                                │
│  ┌──────────────────────┐                       │
│  │  MCP Gateway :3002   │                       │
│  │  (Streamable HTTP)   │                       │
│  └──┬───┬───┬───┬───────┘                       │
│     │   │   │   │                               │
│  ┌──▼┐┌─▼─┐┌▼──┐┌▼────────────┐                │
│  │Cal││Mail││Str││Time Tracker │                │
│  │MCP││MCP ││MCP││Web App+MCP  │                │
│  └─┬─┘└─┬──┘└─┬─┘└─┬──────────┘                │
│    │     │     │    │                           │
│  Apple Apple  Shortcuts  SQLite                 │
│  Calendar Mail  CLI      DB                     │
└─────────────────────────────────────────────────┘
```

### Key Decisions

- **Separate MCP servers per app** — independent development, testing, and failure isolation
- **Single MCP Gateway** on port 3002 exposes separate Streamable HTTP endpoints per MCP server (e.g., `/calendar`, `/mail`), each managing its own stdio backend process
- **Container agent** connects to the gateway alongside the existing stdio-based `nanoclaw` MCP server
- **Structured** uses Apple Shortcuts CLI (`shortcuts run`) under the hood since it has no direct API
- **Time tracker** is a Next.js app (shadcn/ui + Tailwind + TypeScript) with SQLite, serving both the web UI and the MCP server
- **All services** managed via launchd (individual plists for independent restart)

## MCP Server Specifications

### 1. Apple Calendar MCP Server

**Transport:** stdio (spawned by gateway)
**Backend:** JXA (JavaScript for Automation) via `osascript -l JavaScript`

#### Tools

| Tool | Parameters | Returns |
|------|-----------|---------|
| `get_events` | `date: string`, `end_date?: string`, `calendar?: string` | Array of events (title, start, end, location, calendar, notes) |
| `create_event` | `title: string`, `start: string`, `end: string`, `calendar?: string`, `location?: string`, `notes?: string` | Created event ID |
| `update_event` | `event_id: string`, `title?: string`, `start?: string`, `end?: string`, `location?: string`, `notes?: string` | Success boolean |
| `delete_event` | `event_id: string` | Success boolean |
| `get_calendars` | none | Array of calendar names |
| `check_availability` | `date: string`, `start_time?: string`, `end_time?: string` | Array of free time slots |

### 2. Apple Mail MCP Server

**Transport:** stdio (spawned by gateway)
**Backend:** JXA via `osascript -l JavaScript`

#### Tools

| Tool | Parameters | Returns |
|------|-----------|---------|
| `get_recent_emails` | `limit?: number`, `mailbox?: string`, `unread_only?: boolean` | Array of emails (id, subject, sender, date, snippet) |
| `search_emails` | `query: string`, `mailbox?: string`, `limit?: number` | Array of matching emails |
| `get_email` | `email_id: string` | Full email (subject, sender, recipients, date, body) |
| `send_email` | `to: string`, `subject: string`, `body: string`, `cc?: string`, `bcc?: string` | Success boolean |
| `reply_to_email` | `email_id: string`, `body: string`, `reply_all?: boolean` | Success boolean |
| `get_mailboxes` | none | Array of mailbox names |

### 3. Structured MCP Server

**Transport:** stdio (spawned by gateway)
**Backend:** Apple Shortcuts CLI (`shortcuts run <name> -i <input>`)

#### Tools

| Tool | Parameters | Returns |
|------|-----------|---------|
| `get_today_schedule` | none | Array of tasks/events with times |
| `get_tasks` | `date: string` | Array of tasks for that date |
| `add_task` | `title: string`, `start_time?: string`, `duration?: number` | Success boolean |
| `complete_task` | `task_id: string` | Success boolean |

*Note: Tool set is constrained by Structured's available Shortcuts actions. During implementation, validate available actions by running `shortcuts list` and inspecting Structured's entries. If Structured's Shortcuts support is limited (e.g., no read access to individual tasks), fallback options include: reading Structured's data files directly, or making the integration read-only (schedule display only). The tool set above is aspirational and will be scoped down to what is actually possible.*

### 4. Time Tracker MCP Server

**Transport:** stdio (spawned by gateway)
**Backend:** Direct SQLite via `better-sqlite3`

#### Tools

| Tool | Parameters | Returns |
|------|-----------|---------|
| `log_time` | `date: string`, `start_time: string`, `end_time: string`, `activity: string`, `category?: string`, `expected_activity?: string` | Created entry ID |
| `get_timesheet` | `date: string`, `end_date?: string` | Array of time entries |
| `update_entry` | `id: number`, `activity?: string`, `start_time?: string`, `end_time?: string`, `category?: string` | Success boolean |
| `delete_entry` | `id: number` | Success boolean |
| `get_daily_report` | `date: string` | Expected vs actual breakdown, category totals, hours tracked |
| `get_weekly_report` | `start_date: string` | Daily totals, category breakdown, expected vs actual per day |
| `get_monthly_report` | `month: string` (YYYY-MM) | Weekly totals, category breakdown, trends |

## Time Tracker Web App

**Stack:** Next.js + shadcn/ui + Tailwind CSS + TypeScript + SQLite (`better-sqlite3`)
**Port:** localhost:3003

### Database Schema

```sql
CREATE TABLE categories (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT UNIQUE NOT NULL,
  color TEXT -- hex color for charts
);

CREATE TABLE time_entries (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  date              TEXT NOT NULL,         -- YYYY-MM-DD
  start_time        TEXT NOT NULL,         -- HH:MM
  end_time          TEXT NOT NULL,         -- HH:MM
  activity          TEXT NOT NULL,
  category_id       INTEGER REFERENCES categories(id),
  source            TEXT DEFAULT 'agent',  -- 'agent' or 'manual'
  expected_activity TEXT,                  -- from Structured schedule
  created_at        TEXT DEFAULT (datetime('now')),
  updated_at        TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_entries_date ON time_entries(date);

-- Prevent invalid entries
CHECK (end_time > start_time) -- on time_entries table
```

### SQLite Concurrency

The database is shared between the Next.js web app and the MCP server (separate processes). To handle concurrent writes:
- Enable WAL mode: `PRAGMA journal_mode=WAL`
- Set busy timeout: `PRAGMA busy_timeout=5000`
- Both processes must configure these pragmas on connection open

### Schema Migrations

Simple version-based migrations: a `schema_version` table tracks the current version. On startup, both the web app and MCP server check the version and apply sequential migration SQL files if needed.

### Pages

#### `/` — Today's Timesheet
- Editable table of today's time entries (inline edit/delete)
- Add new entry form
- Side panel or column showing Structured schedule for comparison
- Date picker to view other days

#### `/reports` — Reports Dashboard
- Toggle between daily / weekly / monthly views
- **Daily:** Expected vs actual bar chart per time slot, category breakdown pie chart
- **Weekly:** Stacked bar chart per day, category totals, total hours
- **Monthly:** Weekly aggregates, trend line, category distribution
- Charts via Chart.js (or Recharts for React integration with shadcn)

## MCP Gateway

**Port:** 3002
**Transport:** Streamable HTTP inbound from container, stdio outbound to MCP servers

The gateway exposes separate HTTP endpoints per MCP server. Each endpoint acts as an independent MCP transport that spawns and manages its own stdio backend process. There is no namespace-based routing — the Claude Agent SDK connects to each endpoint as a separate MCP server.

### Endpoints

| Path | Backend |
|------|---------|
| `/calendar` | Apple Calendar MCP (stdio) |
| `/mail` | Apple Mail MCP (stdio) |
| `/structured` | Structured MCP (stdio) |
| `/timetracker` | Time Tracker MCP (stdio) |

### Backend Process Management

Each endpoint:
1. Lazy-spawns its stdio backend on first connection (avoids idle processes)
2. Keeps the process alive for subsequent requests
3. Restarts crashed processes automatically on next request
4. Sets a 30-second timeout on individual tool calls (JXA `osascript` can hang on permission dialogs)
5. Returns structured MCP errors when a backend is unavailable or times out

### Server Registry

```json
{
  "calendar": { "command": "node", "args": ["calendar/dist/index.js"] },
  "mail": { "command": "node", "args": ["mail/dist/index.js"] },
  "structured": { "command": "node", "args": ["structured/dist/index.js"] },
  "timetracker": { "command": "node", "args": ["timetracker/dist/mcp.js"] }
}
```

## Container Agent Integration

### Agent Runner Changes

In `container/agent-runner/src/index.ts`, add the gateway MCP servers.

**Important:** The Claude Agent SDK's `mcpServers` config shape must be verified during implementation. If the SDK supports remote transports (Streamable HTTP / URL-based), configure directly:

```typescript
mcpServers: {
  nanoclaw: {
    // existing stdio MCP server (unchanged)
  },
  calendar: {
    type: 'url',
    url: `http://${CONTAINER_HOST_GATEWAY}:3002/calendar`
  },
  mail: {
    type: 'url',
    url: `http://${CONTAINER_HOST_GATEWAY}:3002/mail`
  },
  structured: {
    type: 'url',
    url: `http://${CONTAINER_HOST_GATEWAY}:3002/structured`
  },
  timetracker: {
    type: 'url',
    url: `http://${CONTAINER_HOST_GATEWAY}:3002/timetracker`
  }
}
```

**Fallback if SDK only supports stdio:** Create a thin stdio-to-HTTP bridge script inside the container. Each MCP server entry spawns this bridge with the target URL as an argument. The bridge translates stdio MCP protocol to HTTP requests to the gateway:

```typescript
calendar: {
  command: 'node',
  args: ['/app/mcp-http-bridge.js', `http://${CONTAINER_HOST_GATEWAY}:3002/calendar`]
}
```

The `allowedTools` pattern in the agent runner already supports wildcards. Add:
```
'mcp__calendar__*', 'mcp__mail__*', 'mcp__structured__*', 'mcp__timetracker__*'
```

## Hourly Check-in Flow

Implemented as a NanoClaw scheduled task (cron: `0 * * * *`). Uses `context_mode: 'group'` so the agent has conversation history.

### State Machine

The check-in is a two-phase process across separate agent invocations:

**Phase 1 — Scheduled task fires (top of hour):**
1. Agent calls `mcp__structured__get_tasks` for the previous hour
2. Agent sends Telegram message:
   > "It's 2pm. According to Structured, you had 'Design review' scheduled 1-2pm. Did you spend your time on that, or something else?"
3. Container exits

**Phase 2 — User replies (triggers new agent invocation):**
1. User's reply arrives as a normal Telegram message
2. New agent session starts with group conversation history (includes the check-in question)
3. Agent recognizes the reply is answering a check-in
4. Agent calls `mcp__timetracker__log_time` with the response and expected activity
5. Container exits

**Edge cases:**
- **No reply:** If the user doesn't reply before the next hourly check-in, the new check-in covers the current hour only. Unreplied hours are not logged (gaps are visible in reports). The agent should note the gap: "I notice the 1-2pm slot wasn't logged."
- **Late reply:** If the user replies to a check-in after the next one has fired, the agent logs it for the correct hour based on conversation context.
- **End of day (6pm or configurable):** A separate scheduled task calls `mcp__timetracker__get_daily_report` and sends a summary comparing planned vs actual. Notes any unlogged hours.

## Project Structure

```
nanoclaw/
├── mcp-servers/
│   ├── gateway/                -- MCP Gateway (Streamable HTTP → stdio fanout)
│   │   ├── src/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── calendar/               -- Apple Calendar MCP
│   │   ├── src/
│   │   │   ├── index.ts        -- MCP server entry
│   │   │   └── jxa/            -- JXA scripts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── mail/                   -- Apple Mail MCP
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   └── jxa/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── structured/             -- Structured MCP (Shortcuts bridge)
│   │   ├── src/
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── timetracker/            -- Time Tracker (Web App + MCP)
│       ├── src/
│       │   ├── app/            -- Next.js app router pages
│       │   │   ├── page.tsx    -- Timesheet page
│       │   │   └── reports/
│       │   │       └── page.tsx -- Reports page
│       │   ├── components/     -- shadcn/ui components
│       │   ├── db/
│       │   │   ├── schema.ts   -- SQLite schema + migrations
│       │   │   └── queries.ts  -- Query functions
│       │   └── mcp/
│       │       └── index.ts    -- MCP server entry
│       ├── package.json
│       ├── tailwind.config.ts
│       └── tsconfig.json
```

## Process Management

Individual launchd plists for each service:

| Service | Plist | Port |
|---------|-------|------|
| MCP Gateway | `com.nanoclaw.mcp-gateway.plist` | 3002 |
| Time Tracker Web | `com.nanoclaw.timetracker.plist` | 3003 |

Calendar, Mail, Structured, and Time Tracker MCP servers are spawned as child processes by the gateway (not independent daemons).

## Security Considerations

- MCP servers run on the host with the user's macOS permissions (needed for Calendar/Mail access)
- The MCP Gateway binds to localhost only — not exposed to the network
- Container agent connects via the existing host gateway mechanism (same as credential proxy)
- Time tracker SQLite DB is stored outside the container — agent has read/write access only through MCP tools
- No API keys or tokens needed — Calendar and Mail use the user's logged-in macOS session
- Structured access is through Shortcuts, which respects macOS permission prompts
