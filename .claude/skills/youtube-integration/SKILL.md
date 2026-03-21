---
name: youtube-integration
description: YouTube integration for NanoClaw. Discover recent videos by topic and channel, and generate YouTube Studio analytics reports. Read-only — no posting. Use for setup, testing, or troubleshooting YouTube functionality. Triggers on "setup youtube", "youtube integration", "discover youtube videos", "youtube report".
---

# YouTube Integration

Browser automation for YouTube content discovery and analytics via WhatsApp.

> **Compatibility:** NanoClaw v1.0.0. Directory structure may change in future versions.

> **Read-only skill:** YouTube integration supports discovery and reporting only. It does not post, comment, or interact with videos.

## Features

| Action | Tool | Description |
|--------|------|-------------|
| Discover | `yt_discover` | Find recent videos by topic and/or channel, sorted by recency |
| Report | `yt_report` | Generate a YouTube Studio analytics report (subscribers, views, watch time, top videos) |

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
npx dotenv -e .env -- npx tsx .claude/skills/youtube-integration/scripts/setup.ts
# Verify: data/youtube-auth.json should exist after successful login

# 2. Rebuild container to include skill
./container/build.sh
# Verify: Output shows "COPY .claude/skills/youtube-integration/agent.ts"

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
| `YOUTUBE_TOPICS` | — | Comma-separated topics for default discovery (e.g., `AI,machine learning`) |
| `YOUTUBE_CHANNELS` | — | Comma-separated YouTube channel handles for default discovery (e.g., `@mkbhd,@veritasium`) |
| `CONTENT_DATA_REPO` | — | GitHub repo (`owner/repo`) for persisting discovery results |
| `GITHUB_PAT` | — | GitHub personal access token (required if `CONTENT_DATA_REPO` is set) |

Set in `.env` file (loaded via `dotenv-cli` at runtime):

```bash
# .env
CHROME_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
YOUTUBE_TOPICS=AI,machine learning,software engineering
YOUTUBE_CHANNELS=@mkbhd,@veritasium,@fireship
CONTENT_DATA_REPO=your-org/nanoclaw-data
GITHUB_PAT=ghp_...
```

### Configuration File

Edit `.claude/skills/youtube-integration/lib/config.ts` to modify defaults:

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

    // Discovery limits
    limits: {
        maxTopics: 5,
        maxChannels: 5,
        resultsPerTopic: 5,
        resultsPerChannel: 5,
    },

    // URLs used by scripts
    urls: {
        googleSignIn: 'https://accounts.google.com/signin',
        youtubeStudio: 'https://studio.youtube.com',
        youtube: 'https://www.youtube.com',
    },
};
```

### Data Directories

Paths relative to project root:

| Path | Purpose | Git |
|------|---------|-----|
| `data/youtube-browser-profile/` | Chrome profile with YouTube/Google session | Ignored |
| `data/youtube-auth.json` | Auth state marker | Ignored |
| `logs/nanoclaw.log` | Service logs (contains YouTube operation logs) | Ignored |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Container (Linux VM)                                       │
│  └── agent.ts → MCP tool definitions (yt_discover, etc.)   │
│      └── Writes IPC request to /workspace/ipc/tasks/       │
└──────────────────────┬──────────────────────────────────────┘
                       │ IPC (file system)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Host (macOS)                                               │
│  └── src/ipc.ts → processTaskIpc()                         │
│      └── host.ts → handleYouTubeIpc()                      │
│          └── spawn subprocess → scripts/*.ts               │
│              └── Playwright → Chrome → YouTube Website     │
└─────────────────────────────────────────────────────────────┘
```

### Why This Design?

- **YouTube Data API has quota limits** - The free tier limits are very restrictive for frequent discovery use cases
- **YouTube Studio analytics require login** - Analytics are only accessible in a logged-in session; there is no public API for personal analytics
- **Bot browsers get blocked** - YouTube/Google detects headless browsers and may require CAPTCHA or block access
- **Must use user's real browser** - Reuses the user's actual Chrome on Host with real browser fingerprint to avoid detection
- **One-time authorization** - User signs in with Google once, session persists in Chrome profile for future use

### File Structure

```
.claude/skills/youtube-integration/
├── SKILL.md              # This documentation
├── host.ts               # Host-side IPC handler
├── agent.ts              # Container-side MCP tool definitions
├── lib/
│   ├── config.ts         # Centralized configuration
│   └── browser.ts        # Playwright utilities
└── scripts/
    ├── setup.ts          # Interactive Google sign-in
    ├── discover.ts       # Discover videos by topic/channel
    └── report.ts         # Generate YouTube Studio analytics report
```

### Integration Points

This skill is already wired into NanoClaw. The following integrations are pre-configured:

---

**1. Host side: `src/ipc.ts`**

The handler is loaded dynamically at startup alongside other content skills:
```typescript
import { handleYouTubeIpc } from '../.claude/skills/youtube-integration/host.js';
```

The `processTaskIpc` function routes `yt_*` task types to `handleYouTubeIpc`.

---

**2. Container side: `container/agent-runner/src/ipc-mcp.ts`**

The tools are registered via `registerYouTubeTools`:
```typescript
import { registerYouTubeTools } from './skills/youtube-integration/agent.js';
// ...
registerYouTubeTools(server, { groupFolder, isMain });
```

---

**3. Build script: `container/build.sh`**

The build context is project root, so `.claude/skills/` is accessible.

---

**4. Dockerfile: `container/Dockerfile`**

The agent.ts is copied into the container:
```dockerfile
COPY .claude/skills/youtube-integration/agent.ts ./src/skills/youtube-integration/
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
npx dotenv -e .env -- npx tsx .claude/skills/youtube-integration/scripts/setup.ts
```

This opens Chrome for manual Google sign-in. Session saved to `data/youtube-browser-profile/`.

**Verify success:**
```bash
cat data/youtube-auth.json  # Should show {"authenticated": true, ...}
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
@Assistant discover YouTube videos about AI and machine learning

@Assistant discover recent videos from @mkbhd and @veritasium

@Assistant generate a YouTube report for last week

@Assistant generate a YouTube report for last month
```

**Note:** Only the main group can use YouTube tools. Other groups will receive an error.

## Testing

Scripts require environment variables from `.env`. Use `dotenv-cli` to load them:

### Check Authentication Status

```bash
# Check if auth file exists and is valid
cat data/youtube-auth.json 2>/dev/null && echo "Auth configured" || echo "Auth not configured"

# Check if browser profile exists
ls -la data/youtube-browser-profile/ 2>/dev/null | head -5
```

### Re-authenticate (if expired)

```bash
npx dotenv -e .env -- npx tsx .claude/skills/youtube-integration/scripts/setup.ts
```

### Test Discover

```bash
echo '{"topics":["AI"],"channels":[]}' | npx dotenv -e .env -- npx tsx .claude/skills/youtube-integration/scripts/discover.ts
```

### Test Report

```bash
echo '{"period":"week"}' | npx dotenv -e .env -- npx tsx .claude/skills/youtube-integration/scripts/report.ts
```

Or export `CHROME_PATH` manually before running:

```bash
export CHROME_PATH="/path/to/chrome"
echo '{"topics":["AI"]}' | npx tsx .claude/skills/youtube-integration/scripts/discover.ts
```

## Troubleshooting

### Authentication Expired

Google sessions can expire after weeks of inactivity. Re-authenticate:

```bash
npx dotenv -e .env -- npx tsx .claude/skills/youtube-integration/scripts/setup.ts
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # macOS
# Linux: systemctl --user restart nanoclaw
```

### Browser Lock Files

If Chrome fails to launch:

```bash
rm -f data/youtube-browser-profile/SingletonLock
rm -f data/youtube-browser-profile/SingletonSocket
rm -f data/youtube-browser-profile/SingletonCookie
```

### Check Logs

```bash
# Host logs (relative to project root)
grep -i "yt_discover\|yt_report\|handleYouTubeIpc" logs/nanoclaw.log | tail -20

# Script errors
grep -i "error\|failed" logs/nanoclaw.log | tail -20
```

### Script Timeout

Default timeout is 3 minutes (180s) for discover/report. Adjust in `host.ts`:

```typescript
const timeoutMs = ['discover', 'report'].includes(script) ? 180000 : 120000;
```

### YouTube Studio UI Selector Changes

If YouTube updates their Studio UI, selectors in `scripts/report.ts` may break. Check the script for current selectors and update as needed.

### Google Sign-In Issues

If the setup script stalls at Google's sign-in page, it may be due to two-factor authentication or a device trust check. Complete the sign-in manually in the Chrome window that opens, then close it — the session is saved automatically.

### Container Build Issues

If MCP tools not found in container:

```bash
# Verify build copies skill
./container/build.sh 2>&1 | grep -i skill

# Check container has the file
docker run nanoclaw-agent ls -la /app/src/skills/
```

## Security

- `data/youtube-browser-profile/` - Contains Google session cookies (in `.gitignore`)
- `data/youtube-auth.json` - Auth state marker (in `.gitignore`)
- Only main group can use YouTube tools (enforced in `agent.ts` and `host.ts`)
- Scripts run as subprocesses with limited environment
- `GITHUB_PAT` is used only for persisting discovery results; store it securely in `.env`
- The Google account used for sign-in should have 2FA enabled; the session is stored locally only
