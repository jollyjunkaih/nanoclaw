---
name: twitter-content
description: Twitter/X content manager for NanoClaw. Post tweets, discover content, draft and post replies, and generate analytics reports. Coexists with x-integration (which handles likes, retweets, quotes). Use for setup, testing, or troubleshooting Twitter content workflows. Triggers on "twitter content", "tw post", "discover tweets", "twitter report".
---

# Twitter Content

Browser automation for Twitter/X content management via WhatsApp.

> **Compatibility:** NanoClaw v1.0.0. Directory structure may change in future versions.

> **Relationship with x-integration:** This skill coexists with `x-integration`. Both share the same Chrome profile (`data/x-browser-profile/`) and auth file (`data/x-auth.json`). `x-integration` handles likes, retweets, and quotes; `twitter-content` handles posting, discovery, replies, and reporting. Only one setup step is needed — authenticating either skill authenticates both.

## Features

| Action | Tool | Description |
|--------|------|-------------|
| Post | `tw_post` | Publish a new tweet (max 280 characters) |
| Discover | `tw_discover` | Find tweets by topic and/or people, sorted by engagement |
| Draft Reply | `tw_draft_reply` | Draft a reply for user approval (does not post) |
| Reply | `tw_reply` | Post an approved reply to a tweet |
| Report | `tw_report` | Generate an analytics report (followers, impressions, top tweets) |

## Prerequisites

Before using this skill, ensure:

1. **NanoClaw is installed and running** - WhatsApp connected, service active
2. **Dependencies installed**:
   ```bash
   npm ls playwright dotenv-cli || npm install playwright dotenv-cli
   ```
3. **CHROME_PATH configured** in `.env` (if Chrome is not at default location):
   ```bash
   # Find your Chrome path
   mdfind "kMDItemCFBundleIdentifier == 'com.google.Chrome'" 2>/dev/null | head -1
   # Add to .env
   CHROME_PATH=/path/to/Google Chrome.app/Contents/MacOS/Google Chrome
   ```

## Quick Start

```bash
# 1. Setup authentication (interactive)
# If x-integration is already authenticated, skip this step — auth is shared.
npx dotenv -e .env -- npx tsx .claude/skills/twitter-content/scripts/setup.ts
# Verify: data/x-auth.json should exist after successful login

# 2. Rebuild container to include skill
./container/build.sh
# Verify: Output shows "COPY .claude/skills/twitter-content/agent.ts"

# 3. Rebuild host and restart service
npm run build
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # macOS
# Linux: systemctl --user restart nanoclaw
# Verify: launchctl list | grep nanoclaw (macOS) or systemctl --user status nanoclaw (Linux)
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CHROME_PATH` | `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` | Chrome executable path |
| `NANOCLAW_ROOT` | `process.cwd()` | Project root directory |
| `LOG_LEVEL` | `info` | Logging level (debug, info, warn, error) |
| `TWITTER_TOPICS` | — | Comma-separated topics for default discovery (e.g., `AI,startups`) |
| `TWITTER_PEOPLE` | — | Comma-separated Twitter handles for default discovery (e.g., `@elonmusk,sama`) |
| `CONTENT_DATA_REPO` | — | GitHub repo (`owner/repo`) for persisting discovery results |
| `GITHUB_PAT` | — | GitHub personal access token (required if `CONTENT_DATA_REPO` is set) |

Set in `.env` file (loaded via `dotenv-cli` at runtime):

```bash
# .env
CHROME_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
TWITTER_TOPICS=AI,startups,product management
TWITTER_PEOPLE=@sama,@karpathy
CONTENT_DATA_REPO=your-org/nanoclaw-data
GITHUB_PAT=ghp_...
```

### Configuration File

Edit `.claude/skills/twitter-content/lib/config.ts` to modify defaults:

```typescript
export const config = {
    // Browser viewport
    viewport: { width: 1280, height: 800 },

    // Timeouts (milliseconds)
    timeouts: {
        navigation: 30000,    // Page navigation
        elementWait: 5000,    // Wait for element
        afterClick: 1000,     // Delay after click
        afterFill: 1000,      // Delay after form fill
        afterSubmit: 3000,    // Delay after submit
        pageLoad: 3000,       // Initial page load
        scrollWait: 3000,     // Delay between scrolls
        betweenSearches: { min: 2000, max: 5000 },
    },

    // Tweet limits
    limits: {
        postMaxLength: 280,
        maxTopics: 5,
        maxPeople: 5,
        resultsPerTopic: 5,
        resultsPerPerson: 3,
    },
};
```

### Data Directories

Paths relative to project root:

| Path | Purpose | Git | Shared With |
|------|---------|-----|-------------|
| `data/x-browser-profile/` | Chrome profile with X session | Ignored | `x-integration` |
| `data/x-auth.json` | Auth state marker | Ignored | `x-integration` |
| `logs/nanoclaw.log` | Service logs (contains Twitter operation logs) | Ignored | — |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Container (Linux VM)                                       │
│  └── agent.ts → MCP tool definitions (tw_post, etc.)       │
│      └── Writes IPC request to /workspace/ipc/tasks/       │
└──────────────────────┬──────────────────────────────────────┘
                       │ IPC (file system)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Host (macOS)                                               │
│  └── src/ipc.ts → processTaskIpc()                         │
│      └── host.ts → handleTwitterContentIpc()               │
│          └── spawn subprocess → scripts/*.ts               │
│              └── Playwright → Chrome → X Website           │
└─────────────────────────────────────────────────────────────┘
```

### Why This Design?

- **API is expensive** - X official API requires paid subscription ($100+/month) for posting
- **Bot browsers get blocked** - X detects and bans headless browsers and common automation fingerprints
- **Must use user's real browser** - Reuses the user's actual Chrome on Host with real browser fingerprint to avoid detection
- **One-time authorization** - User logs in manually once, session persists in Chrome profile for future use

### File Structure

```
.claude/skills/twitter-content/
├── SKILL.md              # This documentation
├── host.ts               # Host-side IPC handler
├── agent.ts              # Container-side MCP tool definitions
├── lib/
│   ├── config.ts         # Centralized configuration
│   └── browser.ts        # Playwright utilities
└── scripts/
    ├── setup.ts          # Interactive login
    ├── post.ts           # Post tweet
    ├── discover.ts       # Discover tweets by topic/people
    ├── draft-reply.ts    # Draft a reply for approval
    ├── reply.ts          # Post approved reply
    └── report.ts         # Generate analytics report
```

### Integration Points

This skill is already wired into NanoClaw. The following integrations are pre-configured:

---

**1. Host side: `src/ipc.ts`**

The handler is loaded dynamically at startup alongside other content skills:
```typescript
import { handleTwitterContentIpc } from '../.claude/skills/twitter-content/host.js';
```

The `processTaskIpc` function routes `tw_*` task types to `handleTwitterContentIpc`.

---

**2. Container side: `container/agent-runner/src/ipc-mcp.ts`**

The tools are registered via `registerTwitterContentTools`:
```typescript
import { registerTwitterContentTools } from './skills/twitter-content/agent.js';
// ...
registerTwitterContentTools(server, { groupFolder, isMain });
```

---

**3. Build script: `container/build.sh`**

The build context is project root, so `.claude/skills/` is accessible.

---

**4. Dockerfile: `container/Dockerfile`**

The agent.ts is copied into the container:
```dockerfile
COPY .claude/skills/twitter-content/agent.ts ./src/skills/twitter-content/
```

## Setup

All paths below are relative to project root (`NANOCLAW_ROOT`).

### 1. Check Chrome Path

```bash
# Check if Chrome exists at configured path
cat .env | grep CHROME_PATH
ls -la "$(grep CHROME_PATH .env | cut -d= -f2)" 2>/dev/null || \
echo "Chrome not found - update CHROME_PATH in .env"
```

### 2. Run Authentication

```bash
npx dotenv -e .env -- npx tsx .claude/skills/twitter-content/scripts/setup.ts
```

This opens Chrome for manual X login. Session saved to `data/x-browser-profile/`.

**Verify success:**
```bash
cat data/x-auth.json  # Should show {"authenticated": true, ...}
```

### 3. Rebuild Container

```bash
./container/build.sh
```

**Verify success:**
```bash
./container/build.sh 2>&1 | grep -i "agent.ts"  # Should show COPY line
```

### 4. Restart Service

```bash
npm run build
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # macOS
# Linux: systemctl --user restart nanoclaw
```

**Verify success:**
```bash
launchctl list | grep nanoclaw  # macOS — should show PID and exit code 0 or -
# Linux: systemctl --user status nanoclaw
```

## Usage via WhatsApp

Replace `@Assistant` with your configured trigger name (`ASSISTANT_NAME` in `.env`):

```
@Assistant post a tweet: Just shipped a new feature — check it out!

@Assistant discover tweets about AI and machine learning

@Assistant discover tweets from @karpathy and @sama

@Assistant draft a reply to https://x.com/user/status/123 with: Great point!

@Assistant generate a Twitter report for last month
```

**Note:** Only the main group can use Twitter content tools. Other groups will receive an error.

## Testing

Scripts require environment variables from `.env`. Use `dotenv-cli` to load them:

### Check Authentication Status

```bash
# Check if auth file exists and is valid
cat data/x-auth.json 2>/dev/null && echo "Auth configured" || echo "Auth not configured"

# Check if browser profile exists
ls -la data/x-browser-profile/ 2>/dev/null | head -5
```

### Re-authenticate (if expired)

```bash
npx dotenv -e .env -- npx tsx .claude/skills/twitter-content/scripts/setup.ts
```

### Test Post (will actually post)

```bash
echo '{"content":"Test tweet - please ignore"}' | npx dotenv -e .env -- npx tsx .claude/skills/twitter-content/scripts/post.ts
```

### Test Discover

```bash
echo '{"topics":["AI"],"people":[]}' | npx dotenv -e .env -- npx tsx .claude/skills/twitter-content/scripts/discover.ts
```

### Test Report

```bash
echo '{"period":"week"}' | npx dotenv -e .env -- npx tsx .claude/skills/twitter-content/scripts/report.ts
```

Or export `CHROME_PATH` manually before running:

```bash
export CHROME_PATH="/path/to/chrome"
echo '{"content":"Test"}' | npx tsx .claude/skills/twitter-content/scripts/post.ts
```

## Troubleshooting

### Authentication Expired

```bash
npx dotenv -e .env -- npx tsx .claude/skills/twitter-content/scripts/setup.ts
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # macOS
# Linux: systemctl --user restart nanoclaw
```

### Browser Lock Files

If Chrome fails to launch:

```bash
rm -f data/x-browser-profile/SingletonLock
rm -f data/x-browser-profile/SingletonSocket
rm -f data/x-browser-profile/SingletonCookie
```

### Check Logs

```bash
# Host logs (relative to project root)
grep -i "tw_post\|tw_discover\|handleTwitterContentIpc" logs/nanoclaw.log | tail -20

# Script errors
grep -i "error\|failed" logs/nanoclaw.log | tail -20
```

### Script Timeout

Default timeout is 2 minutes (120s) for post/reply, and 3 minutes (180s) for discover/report. Adjust in `host.ts`:

```typescript
const timeoutMs = ['discover', 'report'].includes(script) ? 180000 : 120000;
```

### X UI Selector Changes

If X updates their UI, selectors in scripts may break. Check `scripts/post.ts`, `scripts/reply.ts`, and `scripts/discover.ts` for current selectors and update as needed.

### Conflict with x-integration

Both skills share `data/x-browser-profile/` and `data/x-auth.json`. They do not conflict at runtime because they run sequentially via the IPC queue — only one script spawns at a time. If you see unexpected behavior, check that both host handlers are registered and that IPC routing correctly dispatches `tw_*` vs `x_*` task types.

### Container Build Issues

If MCP tools not found in container:

```bash
# Verify build copies skill
./container/build.sh 2>&1 | grep -i skill

# Check container has the file
docker run nanoclaw-agent ls -la /app/src/skills/
```

## Security

- `data/x-browser-profile/` - Contains X session cookies (in `.gitignore`), shared with `x-integration`
- `data/x-auth.json` - Auth state marker (in `.gitignore`), shared with `x-integration`
- Only main group can use Twitter content tools (enforced in `agent.ts` and `host.ts`)
- Scripts run as subprocesses with limited environment
- `GITHUB_PAT` is used only for persisting discovery results; store it securely in `.env`
