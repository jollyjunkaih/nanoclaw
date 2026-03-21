---
name: linkedin-integration
description: LinkedIn integration for NanoClaw. Post updates, publish articles, discover content, draft and post comments, and generate analytics reports. Use for setup, testing, or troubleshooting LinkedIn functionality. Triggers on "setup linkedin", "linkedin integration", "post to linkedin", "linkedin article", "linkedin report".
---

# LinkedIn Integration

Browser automation for LinkedIn interactions via WhatsApp.

> **Compatibility:** NanoClaw v1.0.0. Directory structure may change in future versions.

## Features

| Action | Tool | Description |
|--------|------|-------------|
| Post | `linkedin_post` | Publish a LinkedIn feed post (max 3000 characters) |
| Article | `linkedin_article` | Publish a LinkedIn article with title and body |
| Discover | `linkedin_discover` | Find posts by topic and/or people, sorted by engagement |
| Draft Comment | `linkedin_draft_comment` | Draft a comment for user approval (does not post) |
| Comment | `linkedin_comment` | Post an approved comment on a LinkedIn post |
| Report | `linkedin_report` | Generate an analytics report (followers, impressions, top posts) |

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
npx dotenv -e .env -- npx tsx .claude/skills/linkedin-integration/scripts/setup.ts
# Verify: data/linkedin-auth.json should exist after successful login

# 2. Rebuild container to include skill
./container/build.sh
# Verify: Output shows "COPY .claude/skills/linkedin-integration/agent.ts"

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
| `LINKEDIN_TOPICS` | — | Comma-separated topics for default discovery (e.g., `AI,startups`) |
| `LINKEDIN_PEOPLE` | — | Comma-separated LinkedIn handles/URLs for default discovery |
| `CONTENT_DATA_REPO` | — | GitHub repo (`owner/repo`) for persisting discovery results |
| `GITHUB_PAT` | — | GitHub personal access token (required if `CONTENT_DATA_REPO` is set) |

Set in `.env` file (loaded via `dotenv-cli` at runtime):

```bash
# .env
CHROME_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
LINKEDIN_TOPICS=AI,product management,startups
LINKEDIN_PEOPLE=satyanadella,jeffweiner
CONTENT_DATA_REPO=your-org/nanoclaw-data
GITHUB_PAT=ghp_...
```

### Configuration File

Edit `.claude/skills/linkedin-integration/lib/config.ts` to modify defaults:

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
        postMaxLength: 3000,
        maxTopics: 5,
        maxPeople: 5,
        resultsPerTopic: 5,
        resultsPerPerson: 3,
    },
};
```

### Data Directories

Paths relative to project root:

| Path | Purpose | Git |
|------|---------|-----|
| `data/linkedin-browser-profile/` | Chrome profile with LinkedIn session | Ignored |
| `data/linkedin-auth.json` | Auth state marker | Ignored |
| `logs/nanoclaw.log` | Service logs (contains LinkedIn operation logs) | Ignored |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Container (Linux VM)                                       │
│  └── agent.ts → MCP tool definitions (linkedin_post, etc.) │
│      └── Writes IPC request to /workspace/ipc/tasks/       │
└──────────────────────┬──────────────────────────────────────┘
                       │ IPC (file system)
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Host (macOS)                                               │
│  └── src/ipc.ts → processTaskIpc()                         │
│      └── host.ts → handleLinkedInIpc()                     │
│          └── spawn subprocess → scripts/*.ts               │
│              └── Playwright → Chrome → LinkedIn Website    │
└─────────────────────────────────────────────────────────────┘
```

### Why This Design?

- **API is expensive** - LinkedIn official API requires a partner application and approval process
- **Bot browsers get blocked** - LinkedIn detects and bans headless browsers and common automation fingerprints
- **Must use user's real browser** - Reuses the user's actual Chrome on Host with real browser fingerprint to avoid detection
- **One-time authorization** - User logs in manually once, session persists in Chrome profile for future use

### File Structure

```
.claude/skills/linkedin-integration/
├── SKILL.md              # This documentation
├── host.ts               # Host-side IPC handler
├── agent.ts              # Container-side MCP tool definitions
├── lib/
│   ├── config.ts         # Centralized configuration
│   └── browser.ts        # Playwright utilities
└── scripts/
    ├── setup.ts          # Interactive login
    ├── post.ts           # Publish feed post
    ├── article.ts        # Publish article
    ├── discover.ts       # Discover posts by topic/people
    ├── draft-comment.ts  # Draft a comment for approval
    ├── comment.ts        # Post approved comment
    └── report.ts         # Generate analytics report
```

### Integration Points

This skill is already wired into NanoClaw. The following integrations are pre-configured:

---

**1. Host side: `src/ipc.ts`**

The handler is loaded dynamically at startup alongside other content skills:
```typescript
import { handleLinkedInIpc } from '../.claude/skills/linkedin-integration/host.js';
```

The `processTaskIpc` function routes `linkedin_*` task types to `handleLinkedInIpc`.

---

**2. Container side: `container/agent-runner/src/ipc-mcp.ts`**

The tools are registered via `registerLinkedInTools`:
```typescript
import { registerLinkedInTools } from './skills/linkedin-integration/agent.js';
// ...
registerLinkedInTools(server, { groupFolder, isMain });
```

---

**3. Build script: `container/build.sh`**

The build context is project root, so `.claude/skills/` is accessible.

---

**4. Dockerfile: `container/Dockerfile`**

The agent.ts is copied into the container:
```dockerfile
COPY .claude/skills/linkedin-integration/agent.ts ./src/skills/linkedin-integration/
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
npx dotenv -e .env -- npx tsx .claude/skills/linkedin-integration/scripts/setup.ts
```

This opens Chrome for manual LinkedIn login. Session saved to `data/linkedin-browser-profile/`.

**Verify success:**
```bash
cat data/linkedin-auth.json  # Should show {"authenticated": true, ...}
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
@Assistant post to LinkedIn: Excited to share that we just launched...

@Assistant publish a LinkedIn article titled "The Future of AI" with body: ...

@Assistant discover LinkedIn posts about AI and startups

@Assistant discover LinkedIn posts from satyanadella and jeffweiner

@Assistant draft a comment on https://www.linkedin.com/posts/... with: Great insight!

@Assistant generate a LinkedIn report for last week
```

**Note:** Only the main group can use LinkedIn tools. Other groups will receive an error.

## Testing

Scripts require environment variables from `.env`. Use `dotenv-cli` to load them:

### Check Authentication Status

```bash
# Check if auth file exists and is valid
cat data/linkedin-auth.json 2>/dev/null && echo "Auth configured" || echo "Auth not configured"

# Check if browser profile exists
ls -la data/linkedin-browser-profile/ 2>/dev/null | head -5
```

### Re-authenticate (if expired)

```bash
npx dotenv -e .env -- npx tsx .claude/skills/linkedin-integration/scripts/setup.ts
```

### Test Post (will actually post)

```bash
echo '{"content":"Test post - please ignore"}' | npx dotenv -e .env -- npx tsx .claude/skills/linkedin-integration/scripts/post.ts
```

### Test Discover

```bash
echo '{"topics":["AI"],"people":[]}' | npx dotenv -e .env -- npx tsx .claude/skills/linkedin-integration/scripts/discover.ts
```

### Test Report

```bash
echo '{"period":"week"}' | npx dotenv -e .env -- npx tsx .claude/skills/linkedin-integration/scripts/report.ts
```

Or export `CHROME_PATH` manually before running:

```bash
export CHROME_PATH="/path/to/chrome"
echo '{"content":"Test"}' | npx tsx .claude/skills/linkedin-integration/scripts/post.ts
```

## Troubleshooting

### Authentication Expired

```bash
npx dotenv -e .env -- npx tsx .claude/skills/linkedin-integration/scripts/setup.ts
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # macOS
# Linux: systemctl --user restart nanoclaw
```

### Browser Lock Files

If Chrome fails to launch:

```bash
rm -f data/linkedin-browser-profile/SingletonLock
rm -f data/linkedin-browser-profile/SingletonSocket
rm -f data/linkedin-browser-profile/SingletonCookie
```

### Check Logs

```bash
# Host logs (relative to project root)
grep -i "linkedin_post\|linkedin_discover\|handleLinkedInIpc" logs/nanoclaw.log | tail -20

# Script errors
grep -i "error\|failed" logs/nanoclaw.log | tail -20
```

### Script Timeout

Default timeout is 2 minutes (120s) for post/article/comment, and 3 minutes (180s) for discover/report. Adjust in `host.ts`:

```typescript
const timeoutMs = ['discover', 'report'].includes(script) ? 180000 : 120000;
```

### LinkedIn UI Selector Changes

If LinkedIn updates their UI, selectors in scripts may break. Check `scripts/post.ts`, `scripts/comment.ts`, and `scripts/discover.ts` for current selectors and update as needed.

### Container Build Issues

If MCP tools not found in container:

```bash
# Verify build copies skill
./container/build.sh 2>&1 | grep -i skill

# Check container has the file
docker run nanoclaw-agent ls -la /app/src/skills/
```

## Security

- `data/linkedin-browser-profile/` - Contains LinkedIn session cookies (in `.gitignore`)
- `data/linkedin-auth.json` - Auth state marker (in `.gitignore`)
- Only main group can use LinkedIn tools (enforced in `agent.ts` and `host.ts`)
- Scripts run as subprocesses with limited environment
- `GITHUB_PAT` is used only for persisting discovery results; store it securely in `.env`
