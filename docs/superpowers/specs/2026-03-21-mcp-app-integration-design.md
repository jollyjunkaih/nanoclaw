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
│  │  - mcp__mail__*       ├─ via SSE gateway  │  │
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
│  │  (SSE transport)     │                       │
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
- **Single MCP Gateway** on port 3002 provides SSE transport to the container agent, fans out to backend MCP servers via stdio
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

*Note: Tool set is constrained by Structured's available Shortcuts actions. Will be refined during implementation based on what actions are actually exposed.*

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
```

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
**Transport:** SSE (server-sent events) inbound from container, stdio outbound to MCP servers

The gateway:
1. Accepts SSE connections from the container agent
2. Receives tool call requests
3. Routes to the correct backend MCP server based on tool namespace prefix
4. Spawns backend MCP servers as child processes (stdio transport)
5. Returns results over SSE

### Server Registry

The gateway maintains a mapping of namespace → MCP server command:

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

In `container/agent-runner/src/index.ts`, add the gateway as an additional MCP server:

```typescript
mcpServers: {
  nanoclaw: {
    // existing stdio MCP server (unchanged)
  },
  calendar: {
    type: 'sse',
    url: `http://${CONTAINER_HOST_GATEWAY}:3002/calendar`
  },
  mail: {
    type: 'sse',
    url: `http://${CONTAINER_HOST_GATEWAY}:3002/mail`
  },
  structured: {
    type: 'sse',
    url: `http://${CONTAINER_HOST_GATEWAY}:3002/structured`
  },
  timetracker: {
    type: 'sse',
    url: `http://${CONTAINER_HOST_GATEWAY}:3002/timetracker`
  }
}
```

The `allowedTools` pattern in the agent runner already supports wildcards. Add:
```
'mcp__calendar__*', 'mcp__mail__*', 'mcp__structured__*', 'mcp__timetracker__*'
```

## Hourly Check-in Flow

Implemented as a NanoClaw scheduled task (cron: `0 * * * *`):

1. **Trigger:** Task scheduler fires the cron job
2. **Fetch schedule:** Agent calls `mcp__structured__get_tasks` for the previous hour
3. **Send check-in:** Agent sends Telegram message:
   > "It's 2pm. According to Structured, you had 'Design review' scheduled 1-2pm. Did you spend your time on that, or something else?"
4. **Receive response:** User replies via Telegram
5. **Log time:** Agent calls `mcp__timetracker__log_time` with the user's response and the expected activity from Structured
6. **End of day (6pm or configurable):** Agent calls `mcp__timetracker__get_daily_report` and sends a summary comparing planned vs actual

## Project Structure

```
nanoclaw/
├── mcp-servers/
│   ├── gateway/                -- MCP Gateway (SSE → stdio fanout)
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

## WhatsApp Removal

As a separate task, remove WhatsApp from the NanoClaw installation. The user's messaging channel is Telegram only.

## Security Considerations

- MCP servers run on the host with the user's macOS permissions (needed for Calendar/Mail access)
- The MCP Gateway binds to localhost only — not exposed to the network
- Container agent connects via the existing host gateway mechanism (same as credential proxy)
- Time tracker SQLite DB is stored outside the container — agent has read/write access only through MCP tools
- No API keys or tokens needed — Calendar and Mail use the user's logged-in macOS session
- Structured access is through Shortcuts, which respects macOS permission prompts
