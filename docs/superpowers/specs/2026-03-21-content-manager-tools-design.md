# Content Manager Tools — Design Spec

Browser-based tools for LinkedIn, Twitter, and YouTube content management. Three separate NanoClaw skills following the X-integration pattern.

## Requirements

### LinkedIn & Twitter
1. **Create posts** — browser automation (no API)
2. **Discover interesting posts** — topic search + monitored people
3. **Comment/network** — draft comments for user approval before posting
4. **Reports** — engagement, growth, and content performance metrics

### YouTube
1. **Discover ideas** — trending topics + monitored channels
2. **Reports** — subscriber, view, and watch time metrics

### Cross-cutting
- All data (discovery results + reports) persisted to a private GitHub repo with dated files
- Reports available on-demand and via scheduled runs (weekly summaries)
- Browser-only — no API keys, uses persistent Chrome profiles per platform

## Architecture

### Skill Structure

Three independent skills, each following the X-integration IPC pattern:

```
.claude/skills/linkedin-integration/
├── SKILL.md
├── agent.ts              # MCP tools: linkedin_post, linkedin_discover, linkedin_draft_comment, linkedin_comment, linkedin_report
├── host.ts               # IPC handler for linkedin_* types
├── lib/
│   ├── config.ts         # Paths, timeouts, 3000-char post limit
│   └── browser.ts        # Playwright helpers + persistent Chrome profile
└── scripts/
    ├── setup.ts          # Interactive LinkedIn login
    ├── post.ts           # Create a post
    ├── discover.ts       # Search topics + monitored people
    ├── draft-comment.ts  # Navigate to post, return draft for approval
    ├── comment.ts        # Post approved comment
    └── report.ts         # Scrape profile analytics

.claude/skills/twitter-content/
├── SKILL.md
├── agent.ts              # MCP tools: tw_post, tw_discover, tw_draft_reply, tw_reply, tw_report
├── host.ts               # IPC handler for tw_* types
├── lib/
│   ├── config.ts         # Paths, timeouts, 280-char limit
│   └── browser.ts        # Playwright helpers
└── scripts/
    ├── setup.ts          # Interactive X login
    ├── post.ts           # Post a tweet
    ├── discover.ts       # Search trending topics + monitored accounts
    ├── draft-reply.ts    # Draft reply for approval
    ├── reply.ts          # Post approved reply
    └── report.ts         # Scrape profile analytics

.claude/skills/youtube-integration/
├── SKILL.md
├── agent.ts              # MCP tools: yt_discover, yt_report
├── host.ts               # IPC handler for yt_* types
├── lib/
│   ├── config.ts         # Paths, timeouts
│   └── browser.ts        # Playwright helpers
└── scripts/
    ├── setup.ts          # Interactive YouTube/Google login
    ├── discover.ts       # Search trending + monitored channels
    └── report.ts         # Scrape YouTube Studio analytics

.claude/skills/content-shared/
└── lib/
    └── github-persist.ts # Shared: clone repo, write dated file, commit, push
```

### IPC Communication Flow

Same pattern as X-integration:

```
Container (agent.ts)
  → writes IPC request to /workspace/ipc/tasks/{requestId}.json
  → polls /workspace/ipc/{group}/{platform}_results/{requestId}.json

Host (ipc.ts → host.ts)
  → detects task file
  → routes by type prefix (linkedin_*, tw_*, yt_*)
  → spawns script via npx tsx scripts/{action}.ts
  → script reads stdin JSON, performs Playwright automation
  → script writes result as final stdout JSON line
  → host writes result to IPC results directory
```

### Integration Points

#### 1. Host side: `src/ipc.ts`

Add imports:
```typescript
import { handleLinkedInIpc } from '../.claude/skills/linkedin-integration/host.js';
import { handleTwitterContentIpc } from '../.claude/skills/twitter-content/host.js';
import { handleYouTubeIpc } from '../.claude/skills/youtube-integration/host.js';
```

Replace default case in `processTaskIpc`:
```typescript
default: {
  const handled =
    await handleLinkedInIpc(data, sourceGroup, isMain, DATA_DIR) ||
    await handleTwitterContentIpc(data, sourceGroup, isMain, DATA_DIR) ||
    await handleYouTubeIpc(data, sourceGroup, isMain, DATA_DIR);
  if (!handled) {
    logger.warn({ type: data.type }, 'Unknown IPC task type');
  }
}
```

#### 2. Container side: `container/agent-runner/src/ipc-mcp.ts`

```typescript
import { createLinkedInTools } from './skills/linkedin-integration/agent.js';
import { createTwitterContentTools } from './skills/twitter-content/agent.js';
import { createYouTubeTools } from './skills/youtube-integration/agent.js';

// In tools array:
...createLinkedInTools({ groupFolder, isMain }),
...createTwitterContentTools({ groupFolder, isMain }),
...createYouTubeTools({ groupFolder, isMain }),
```

#### 3. Dockerfile

```dockerfile
COPY .claude/skills/linkedin-integration/agent.ts ./src/skills/linkedin-integration/
COPY .claude/skills/twitter-content/agent.ts ./src/skills/twitter-content/
COPY .claude/skills/youtube-integration/agent.ts ./src/skills/youtube-integration/
```

#### 4. Build script: `container/build.sh`

Same change as X-integration — build context from project root.

## MCP Tools

### LinkedIn

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `linkedin_post` | Create a LinkedIn post | `content` (max 3000) | Success/failure + post URL |
| `linkedin_discover` | Find interesting posts | `topics` (string[]), `people` (string[], optional) | Array of posts: author, content snippet, engagement, URL |
| `linkedin_draft_comment` | Draft a comment for approval | `post_url`, `comment` | Draft preview text |
| `linkedin_comment` | Post an approved comment | `post_url`, `comment` | Success/failure |
| `linkedin_report` | Profile analytics | `period` ("week" \| "month") | Followers, impressions, engagement rate, top posts |

### Twitter

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `tw_post` | Post a tweet | `content` (max 280) | Success/failure |
| `tw_discover` | Find interesting tweets | `topics` (string[]), `people` (string[], optional) | Array of tweets: author, content, engagement, URL |
| `tw_draft_reply` | Draft a reply for approval | `tweet_url`, `content` | Draft preview |
| `tw_reply` | Post approved reply | `tweet_url`, `content` | Success/failure |
| `tw_report` | Profile analytics | `period` ("week" \| "month") | Followers, impressions, engagement, top tweets |

### YouTube

| Tool | Description | Input | Output |
|------|-------------|-------|--------|
| `yt_discover` | Find trending videos + monitor channels | `topics` (string[]), `channels` (string[], optional) | Array of videos: title, channel, views, URL |
| `yt_report` | YouTube Studio analytics | `period` ("week" \| "month") | Subscribers, views, watch time, top videos |

## Draft/Approval Flow

For commenting and replying:

1. Agent calls `linkedin_draft_comment` or `tw_draft_reply` with post URL and proposed comment
2. Script navigates to the post, verifies it exists, returns draft preview
3. Agent sends draft to user via messaging channel: "I'd like to comment on [post]: [draft]. Approve?"
4. User approves or edits
5. Agent calls `linkedin_comment` or `tw_reply` with final text
6. Script navigates to post and submits the comment

## Discovery

### Topic Search Flow
1. Navigate to platform search
2. For each topic in `topics[]`, search and collect top ~5 posts/videos
3. For each handle in `people[]`/`channels[]`, visit profile and grab latest ~3 items
4. Deduplicate, sort by engagement
5. Persist to GitHub repo as `discover/{platform}/{YYYY-MM-DD}.json`
6. Return results to agent

### Output Format (all platforms)
```json
{
  "success": true,
  "message": "Found 12 interesting posts",
  "data": [
    {
      "platform": "linkedin",
      "author": "Name (@handle)",
      "content": "First 200 chars...",
      "url": "https://linkedin.com/feed/update/...",
      "engagement": { "likes": 500, "comments": 42, "reposts": 15 },
      "published": "2h ago"
    }
  ]
}
```

## Reports

### Metrics Collected

**LinkedIn** (linkedin.com/analytics/creator):
- Follower count + change over period
- Post impressions
- Engagement rate
- Top 5 posts by impressions

**Twitter** (analytics.x.com or profile page):
- Follower count + change
- Tweet impressions
- Engagement rate
- Top 5 tweets by impressions

**YouTube** (studio.youtube.com/channel/analytics):
- Subscriber count + change
- Total views over period
- Watch time
- Top 5 videos by views

### Delivery
- **On-demand**: user asks agent, agent calls report tools
- **Scheduled**: agent runs reports during weekly scheduled tasks, compiles cross-platform summary
- Reports persisted to GitHub as `reports/{platform}/{YYYY-MM-DD}-{period}.json`
- Agent also writes summary to `performance-log.md` in group folder

## GitHub Persistence

### Repository Structure
```
content-data/
├── discover/
│   ├── linkedin/{YYYY-MM-DD}.json
│   ├── twitter/{YYYY-MM-DD}.json
│   └── youtube/{YYYY-MM-DD}.json
└── reports/
    ├── linkedin/{YYYY-MM-DD}-{period}.json
    ├── twitter/{YYYY-MM-DD}-{period}.json
    └── youtube/{YYYY-MM-DD}-{period}.json
```

### Shared Helper
`.claude/skills/content-shared/lib/github-persist.ts`:

```typescript
export async function persistToGitHub(
  platform: string,       // "linkedin" | "twitter" | "youtube"
  category: string,       // "discover" | "reports"
  date: string,           // "2026-03-21"
  data: object,
  suffix?: string         // optional: "week" | "month"
): Promise<void>
```

- Shallow clones `CONTENT_DATA_REPO` using `GITHUB_PAT`
- Writes dated JSON file to appropriate path
- If file exists for same date (discover runs multiple times), appends entries
- Commits and pushes

## Environment Variables

New entries in `.env`:

```
# Content Manager - GitHub persistence
CONTENT_DATA_REPO=

# Content Manager - LinkedIn
LINKEDIN_TOPICS=
LINKEDIN_PEOPLE=

# Content Manager - Twitter
TWITTER_TOPICS=
TWITTER_PEOPLE=

# Content Manager - YouTube
YOUTUBE_TOPICS=
YOUTUBE_CHANNELS=
```

- `CONTENT_DATA_REPO`: `owner/repo` format, uses existing `GITHUB_PAT`
- `*_TOPICS`: comma-separated default discovery topics
- `*_PEOPLE`/`*_CHANNELS`: comma-separated handles/channel IDs to monitor

## Browser Profiles

| Platform | Profile Dir | Auth Marker |
|----------|------------|-------------|
| LinkedIn | `data/linkedin-browser-profile/` | `data/linkedin-auth.json` |
| Twitter | `data/twitter-browser-profile/` | `data/twitter-auth.json` |
| YouTube | `data/youtube-browser-profile/` | `data/youtube-auth.json` |

All gitignored. Each platform has an independent Chrome profile for session isolation.

## Timeouts

| Action | Timeout |
|--------|---------|
| Post / Comment / Reply | 120s |
| Discover (scrolling, multiple searches) | 180s |
| Report (analytics pages) | 180s |

## Security

- All tools gated to main group only (`if (!isMain)` check)
- Browser profiles in `.gitignore`
- `GITHUB_PAT` accessed via process.env, never exposed to container
- Scripts run as subprocesses with limited environment
