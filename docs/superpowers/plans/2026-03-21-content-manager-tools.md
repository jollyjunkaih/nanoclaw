# Content Manager Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add LinkedIn, Twitter (content), and YouTube browser-automation skills for content creation, discovery, networking, and analytics reporting — with GitHub persistence for all data.

**Architecture:** Three independent NanoClaw skills (`.claude/skills/{linkedin-integration,twitter-content,youtube-integration}/`) plus a shared persistence module (`content-shared/`). Each skill has: MCP tool registrations (`agent.ts`), host-side IPC handler (`host.ts`), Playwright browser scripts (`scripts/`), and shared browser/config helpers (`lib/`). Tools register on the existing MCP server (`ipc-mcp-stdio.ts`) and route through the host IPC watcher.

**Tech Stack:** TypeScript, Playwright (browser automation), NanoClaw IPC (file-based), MCP SDK (`@modelcontextprotocol/sdk`), Git CLI (GitHub persistence)

**Spec:** `docs/superpowers/specs/2026-03-21-content-manager-tools-design.md`

---

## Important: Container Tool Architecture

The container agent uses `query()` from the Claude Agent SDK with tools exposed via an MCP server (`container/agent-runner/src/ipc-mcp-stdio.ts`). The X-integration's `agent.ts` was designed for a different architecture (`ipc-mcp.ts`) that was never wired in.

For this implementation, each skill's `agent.ts` exports a function that registers tools on the MCP server:

```typescript
// Pattern: each agent.ts exports a registration function
export function registerLinkedInTools(server: McpServer, ctx: { groupFolder: string; isMain: boolean }): void {
  server.tool('linkedin_post', description, schema, handler);
}
```

These are imported in `ipc-mcp-stdio.ts` and called at startup.

---

## File Structure

### New files

```
.claude/skills/content-shared/
└── lib/
    └── github-persist.ts       # Shared: clone repo, write dated JSON, commit, push (with file lock)

.claude/skills/linkedin-integration/
├── SKILL.md                    # Setup guide + integration points
├── agent.ts                    # MCP tool registrations (linkedin_post, linkedin_article, etc.)
├── host.ts                     # IPC handler for linkedin_* types
├── lib/
│   ├── config.ts               # Paths, timeouts, 3000-char limit
│   └── browser.ts              # Playwright helpers (getBrowserContext, cleanupLockFiles, etc.)
└── scripts/
    ├── setup.ts                # Interactive LinkedIn login
    ├── post.ts                 # Create a feed post
    ├── article.ts              # Publish a LinkedIn article
    ├── discover.ts             # Search topics + monitored people
    ├── draft-comment.ts        # Navigate to post, return draft for approval
    ├── comment.ts              # Post approved comment
    └── report.ts               # Scrape profile analytics

.claude/skills/twitter-content/
├── SKILL.md                    # Setup guide + integration points
├── agent.ts                    # MCP tool registrations (tw_post, tw_discover, etc.)
├── host.ts                     # IPC handler for tw_* types
├── lib/
│   ├── config.ts               # Paths, timeouts, 280-char limit
│   └── browser.ts              # Playwright helpers (reuses x-browser-profile)
└── scripts/
    ├── setup.ts                # Interactive X login (or reuse existing X-integration auth)
    ├── post.ts                 # Post a tweet
    ├── discover.ts             # Search trending topics + monitored accounts
    ├── draft-reply.ts          # Draft reply for approval
    ├── reply.ts                # Post approved reply
    └── report.ts               # Scrape profile analytics

.claude/skills/youtube-integration/
├── SKILL.md                    # Setup guide + integration points
├── agent.ts                    # MCP tool registrations (yt_discover, yt_report)
├── host.ts                     # IPC handler for yt_* types
├── lib/
│   ├── config.ts               # Paths, timeouts
│   └── browser.ts              # Playwright helpers
└── scripts/
    ├── setup.ts                # Interactive YouTube/Google login
    ├── discover.ts             # Search trending + monitored channels
    └── report.ts               # Scrape YouTube Studio analytics
```

### Modified files

```
.env                                        # Add empty env vars for user to populate
.gitignore                                  # Add browser profile dirs (already covered by data/)
container/agent-runner/src/ipc-mcp-stdio.ts # Import + register skill tools
container/Dockerfile                        # COPY agent.ts files into container
container/build.sh                          # Change build context to project root
src/ipc.ts                                  # Import + chain skill IPC handlers
```

---

## Task 1: Shared GitHub Persistence Module

**Files:**
- Create: `.claude/skills/content-shared/lib/github-persist.ts`

- [ ] **Step 1: Create the github-persist module**

```typescript
// .claude/skills/content-shared/lib/github-persist.ts
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: { target: 'pino-pretty', options: { colorize: true } }
});

const PROJECT_ROOT = process.env.NANOCLAW_ROOT || process.cwd();
const LOCK_FILE = path.join(PROJECT_ROOT, 'data', 'github-persist.lock');
const CLONE_DIR = path.join(PROJECT_ROOT, 'data', 'content-data-repo');

async function acquireLock(maxWaitMs = 30000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      fs.mkdirSync(path.dirname(LOCK_FILE), { recursive: true });
      // O_EXCL fails if file exists — atomic lock
      const fd = fs.openSync(LOCK_FILE, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return true;
    } catch {
      // Lock held by another process, async wait
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  return false;
}

function releaseLock(): void {
  try { fs.unlinkSync(LOCK_FILE); } catch {}
}

/**
 * Persist data to a private GitHub repo.
 * Non-blocking when called from host.ts — fire and forget.
 */
export async function persistToGitHub(
  platform: string,   // "linkedin" | "twitter" | "youtube"
  category: string,   // "discover" | "reports"
  date: string,       // "2026-03-21"
  data: object,
  suffix?: string     // optional: "week" | "month"
): Promise<void> {
  const repo = process.env.CONTENT_DATA_REPO;
  const pat = process.env.GITHUB_PAT;
  if (!repo || !pat) {
    logger.warn('CONTENT_DATA_REPO or GITHUB_PAT not set, skipping persistence');
    return;
  }

  if (!await acquireLock()) {
    logger.warn('Could not acquire github-persist lock, skipping');
    return;
  }

  try {
    const repoUrl = `https://${pat}@github.com/${repo}.git`;

    // Clone or pull
    if (!fs.existsSync(path.join(CLONE_DIR, '.git'))) {
      fs.mkdirSync(CLONE_DIR, { recursive: true });
      execSync(`git clone --depth 1 ${repoUrl} ${CLONE_DIR}`, { stdio: 'pipe' });
    } else {
      execSync('git pull --rebase', { cwd: CLONE_DIR, stdio: 'pipe' });
    }

    // Build file path
    const filename = suffix ? `${date}-${suffix}.json` : `${date}.json`;
    const dirPath = path.join(CLONE_DIR, category, platform);
    fs.mkdirSync(dirPath, { recursive: true });
    const filePath = path.join(dirPath, filename);

    // If file exists for same date (discover runs multiple times), merge data arrays
    let fileData: unknown;
    if (fs.existsSync(filePath)) {
      const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (Array.isArray(existing) && Array.isArray(data)) {
        fileData = [...existing, ...data];
      } else if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
        // For reports, overwrite with latest
        fileData = data;
      } else {
        fileData = data;
      }
    } else {
      fileData = data;
    }

    fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2));

    // Commit and push
    execSync('git add -A', { cwd: CLONE_DIR, stdio: 'pipe' });
    const status = execSync('git status --porcelain', { cwd: CLONE_DIR, encoding: 'utf-8' }).trim();
    if (status) {
      const msg = `${category}/${platform}: ${filename}`;
      execSync(`git commit -m ${JSON.stringify(msg)}`, { cwd: CLONE_DIR, stdio: 'pipe' });
      execSync('git push', { cwd: CLONE_DIR, stdio: 'pipe' });
      logger.info({ platform, category, filename }, 'Persisted to GitHub');
    }
  } catch (err) {
    logger.error({ err, platform, category }, 'GitHub persistence failed');
  } finally {
    releaseLock();
  }
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npx tsx --eval "import('./.claude/skills/content-shared/lib/github-persist.ts').then(() => console.log('OK'))"`
Expected: "OK" (or module-level import errors about env vars, which is fine)

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/content-shared/lib/github-persist.ts
git commit -m "feat: add shared github persistence module for content manager"
```

---

## Task 2: LinkedIn Integration — Lib Layer

**Files:**
- Create: `.claude/skills/linkedin-integration/lib/config.ts`
- Create: `.claude/skills/linkedin-integration/lib/browser.ts`

- [ ] **Step 1: Create LinkedIn config**

```typescript
// .claude/skills/linkedin-integration/lib/config.ts
import path from 'path';

const PROJECT_ROOT = process.env.NANOCLAW_ROOT || process.cwd();

export const config = {
  chromePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  browserDataDir: path.join(PROJECT_ROOT, 'data', 'linkedin-browser-profile'),
  authPath: path.join(PROJECT_ROOT, 'data', 'linkedin-auth.json'),

  viewport: { width: 1280, height: 800 },

  timeouts: {
    navigation: 30000,
    elementWait: 5000,
    afterClick: 1000,
    afterFill: 1000,
    afterSubmit: 3000,
    pageLoad: 3000,
    scrollWait: 3000,
    betweenSearches: { min: 2000, max: 5000 },
  },

  limits: {
    postMaxLength: 3000,
    maxTopics: 5,
    maxPeople: 5,
    maxScrollIterations: 3,
    resultsPerTopic: 5,
    resultsPerPerson: 3,
  },

  chromeArgs: [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
  ],

  chromeIgnoreDefaultArgs: ['--enable-automation'],
};
```

- [ ] **Step 2: Create LinkedIn browser helpers**

```typescript
// .claude/skills/linkedin-integration/lib/browser.ts
import { chromium, BrowserContext } from 'playwright';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';

export { config };

export interface ScriptResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export async function readInput<T>(): Promise<T> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch (err) { reject(new Error(`Invalid JSON input: ${err}`)); }
    });
    process.stdin.on('error', reject);
  });
}

export function writeResult(result: ScriptResult): void {
  console.log(JSON.stringify(result));
}

export function cleanupLockFiles(): void {
  for (const lockFile of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    const lockPath = path.join(config.browserDataDir, lockFile);
    if (fs.existsSync(lockPath)) {
      try { fs.unlinkSync(lockPath); } catch {}
    }
  }
}

export function validateContent(content: string | undefined, type = 'Post'): ScriptResult | null {
  if (!content || content.length === 0) {
    return { success: false, message: `${type} content cannot be empty` };
  }
  if (content.length > config.limits.postMaxLength) {
    return { success: false, message: `${type} exceeds ${config.limits.postMaxLength} character limit (current: ${content.length})` };
  }
  return null;
}

export async function getBrowserContext(): Promise<BrowserContext> {
  if (!fs.existsSync(config.authPath)) {
    throw new Error('LinkedIn authentication not configured. Run setup first.');
  }
  cleanupLockFiles();
  return chromium.launchPersistentContext(config.browserDataDir, {
    executablePath: config.chromePath,
    headless: false,
    viewport: config.viewport,
    args: config.chromeArgs,
    ignoreDefaultArgs: config.chromeIgnoreDefaultArgs,
  });
}

export function randomDelay(): number {
  const { min, max } = config.timeouts.betweenSearches;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export async function runScript<T>(
  handler: (input: T) => Promise<ScriptResult>
): Promise<void> {
  try {
    const input = await readInput<T>();
    const result = await handler(input);
    writeResult(result);
  } catch (err) {
    writeResult({
      success: false,
      message: `Script execution failed: ${err instanceof Error ? err.message : String(err)}`
    });
    process.exit(1);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/linkedin-integration/lib/
git commit -m "feat: add LinkedIn integration lib layer (config + browser helpers)"
```

---

## Task 3: LinkedIn Integration — Scripts

**Files:**
- Create: `.claude/skills/linkedin-integration/scripts/setup.ts`
- Create: `.claude/skills/linkedin-integration/scripts/post.ts`
- Create: `.claude/skills/linkedin-integration/scripts/article.ts`
- Create: `.claude/skills/linkedin-integration/scripts/discover.ts`
- Create: `.claude/skills/linkedin-integration/scripts/draft-comment.ts`
- Create: `.claude/skills/linkedin-integration/scripts/comment.ts`
- Create: `.claude/skills/linkedin-integration/scripts/report.ts`

- [ ] **Step 1: Create setup.ts**

Follow the exact pattern from `.claude/skills/x-integration/scripts/setup.ts`. Key differences:
- Navigate to `https://www.linkedin.com/login`
- Verify login by checking for the presence of `[data-test-icon="nav-people-icon"]` or `.global-nav__me-photo` (LinkedIn nav profile icon)
- Save auth marker to `data/linkedin-auth.json`
- Profile dir: `data/linkedin-browser-profile/`

```typescript
#!/usr/bin/env npx tsx
import { chromium } from 'playwright';
import * as readline from 'readline';
import fs from 'fs';
import path from 'path';
import { config, cleanupLockFiles } from '../lib/browser.js';

async function setup(): Promise<void> {
  console.log('=== LinkedIn Authentication Setup ===\n');
  console.log('This will open Chrome for you to log in to LinkedIn.');
  console.log('Your login session will be saved for automated interactions.\n');
  console.log(`Chrome path: ${config.chromePath}`);
  console.log(`Profile dir: ${config.browserDataDir}\n`);

  fs.mkdirSync(path.dirname(config.authPath), { recursive: true });
  fs.mkdirSync(config.browserDataDir, { recursive: true });
  cleanupLockFiles();

  console.log('Launching browser...\n');

  const context = await chromium.launchPersistentContext(config.browserDataDir, {
    executablePath: config.chromePath,
    headless: false,
    viewport: config.viewport,
    args: config.chromeArgs.slice(0, 3),
    ignoreDefaultArgs: config.chromeIgnoreDefaultArgs,
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://www.linkedin.com/login');

  console.log('Please log in to LinkedIn in the browser window.');
  console.log('After you see your feed, come back here and press Enter.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>(resolve => {
    rl.question('Press Enter when logged in... ', () => { rl.close(); resolve(); });
  });

  console.log('\nVerifying login status...');
  await page.goto('https://www.linkedin.com/feed/');
  await page.waitForTimeout(config.timeouts.pageLoad);

  const isLoggedIn = await page.locator('.global-nav__me-photo, [data-test-icon="nav-people-icon"], .feed-identity-module').first().isVisible().catch(() => false);

  if (isLoggedIn) {
    fs.writeFileSync(config.authPath, JSON.stringify({
      authenticated: true,
      timestamp: new Date().toISOString()
    }, null, 2));
    console.log('\n✅ Authentication successful!');
    console.log(`Session saved to: ${config.browserDataDir}`);
  } else {
    console.log('\n❌ Could not verify login status.');
    console.log('Please try again and make sure you are logged in to LinkedIn.');
  }

  await context.close();
}

setup().catch(err => { console.error('Setup failed:', err.message); process.exit(1); });
```

- [ ] **Step 2: Create post.ts**

```typescript
#!/usr/bin/env npx tsx
import { getBrowserContext, runScript, validateContent, config, ScriptResult } from '../lib/browser.js';

interface PostInput { content: string; }

async function createPost(input: PostInput): Promise<ScriptResult> {
  const validationError = validateContent(input.content, 'Post');
  if (validationError) return validationError;

  let context = null;
  try {
    context = await getBrowserContext();
    const page = context.pages()[0] || await context.newPage();

    await page.goto('https://www.linkedin.com/feed/', { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(config.timeouts.pageLoad);

    // Click "Start a post" button
    const startPostBtn = page.locator('.share-box-feed-entry__trigger, button.artdeco-button[aria-label*="Start a post"]');
    await startPostBtn.first().waitFor({ timeout: config.timeouts.elementWait });
    await startPostBtn.first().click();
    await page.waitForTimeout(config.timeouts.afterClick);

    // Fill the post editor
    const editor = page.locator('.ql-editor[data-placeholder], [role="textbox"][aria-label*="Text editor"]');
    await editor.first().waitFor({ timeout: config.timeouts.elementWait });
    await editor.first().click();
    await page.waitForTimeout(config.timeouts.afterClick / 2);
    await editor.first().fill(input.content);
    await page.waitForTimeout(config.timeouts.afterFill);

    // Click Post button
    const postBtn = page.locator('button.share-actions__primary-action');
    await postBtn.waitFor({ timeout: config.timeouts.elementWait });
    await postBtn.click();
    await page.waitForTimeout(config.timeouts.afterSubmit);

    return {
      success: true,
      message: `LinkedIn post created: ${input.content.slice(0, 50)}${input.content.length > 50 ? '...' : ''}`
    };
  } finally {
    if (context) await context.close();
  }
}

runScript<PostInput>(createPost);
```

- [ ] **Step 3: Create article.ts**

```typescript
#!/usr/bin/env npx tsx
import { getBrowserContext, runScript, config, ScriptResult } from '../lib/browser.js';

interface ArticleInput { title: string; content: string; }

async function publishArticle(input: ArticleInput): Promise<ScriptResult> {
  if (!input.title || input.title.length === 0) {
    return { success: false, message: 'Article title cannot be empty' };
  }
  if (!input.content || input.content.length === 0) {
    return { success: false, message: 'Article content cannot be empty' };
  }

  let context = null;
  try {
    context = await getBrowserContext();
    const page = context.pages()[0] || await context.newPage();

    await page.goto('https://www.linkedin.com/article/new/', { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(config.timeouts.pageLoad * 2);

    // Fill title
    const titleField = page.locator('[role="textbox"][data-placeholder*="Title"], .article-editor__title [role="textbox"]');
    await titleField.first().waitFor({ timeout: config.timeouts.elementWait * 2 });
    await titleField.first().click();
    await titleField.first().fill(input.title);
    await page.waitForTimeout(config.timeouts.afterFill);

    // Fill body
    const bodyField = page.locator('.article-editor__content [role="textbox"], .ql-editor');
    await bodyField.first().waitFor({ timeout: config.timeouts.elementWait });
    await bodyField.first().click();
    await bodyField.first().fill(input.content);
    await page.waitForTimeout(config.timeouts.afterFill);

    // Click Publish / Next
    const publishBtn = page.locator('button:has-text("Publish"), button:has-text("Next")');
    await publishBtn.first().waitFor({ timeout: config.timeouts.elementWait });
    await publishBtn.first().click();
    await page.waitForTimeout(config.timeouts.afterSubmit);

    // If there's a confirmation dialog, click Publish again
    const confirmBtn = page.locator('button:has-text("Publish")');
    const hasConfirm = await confirmBtn.isVisible().catch(() => false);
    if (hasConfirm) {
      await confirmBtn.click();
      await page.waitForTimeout(config.timeouts.afterSubmit);
    }

    return {
      success: true,
      message: `LinkedIn article published: ${input.title}`
    };
  } finally {
    if (context) await context.close();
  }
}

runScript<ArticleInput>(publishArticle);
```

- [ ] **Step 4: Create discover.ts**

```typescript
#!/usr/bin/env npx tsx
import { getBrowserContext, runScript, randomDelay, config, ScriptResult } from '../lib/browser.js';
import { persistToGitHub } from '../../content-shared/lib/github-persist.js';

interface DiscoverInput {
  topics?: string[];
  people?: string[];
}

interface DiscoveredPost {
  platform: string;
  author: string;
  content: string;
  url: string;
  engagement: { likes: number; comments: number; reposts: number };
  published: string;
}

async function discoverPosts(input: DiscoverInput): Promise<ScriptResult> {
  const topics = input.topics || process.env.LINKEDIN_TOPICS?.split(',').map(t => t.trim()).filter(Boolean) || [];
  const people = input.people || process.env.LINKEDIN_PEOPLE?.split(',').map(p => p.trim()).filter(Boolean) || [];

  if (topics.length === 0 && people.length === 0) {
    return { success: false, message: 'No topics or people specified. Set LINKEDIN_TOPICS/LINKEDIN_PEOPLE in .env or pass them as arguments.' };
  }

  const results: DiscoveredPost[] = [];
  let context = null;

  try {
    context = await getBrowserContext();
    const page = context.pages()[0] || await context.newPage();

    // Search by topic
    for (const topic of topics.slice(0, config.limits.maxTopics)) {
      try {
        const searchUrl = `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(topic)}&sortBy=%22date_posted%22`;
        await page.goto(searchUrl, { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(config.timeouts.pageLoad);

        // Scroll to load more results
        for (let i = 0; i < config.limits.maxScrollIterations; i++) {
          await page.evaluate(() => window.scrollBy(0, window.innerHeight));
          await page.waitForTimeout(config.timeouts.scrollWait);
        }

        // Extract posts from search results
        const posts = await page.locator('.feed-shared-update-v2').all();
        for (const post of posts.slice(0, config.limits.resultsPerTopic)) {
          try {
            const author = await post.locator('.update-components-actor__name span[aria-hidden="true"]').first().textContent() || 'Unknown';
            const contentEl = post.locator('.feed-shared-update-v2__description, .update-components-text');
            const content = await contentEl.first().textContent() || '';
            const linkEl = post.locator('a[href*="/feed/update/"]').first();
            const url = await linkEl.getAttribute('href') || '';
            const timeEl = post.locator('.update-components-actor__sub-description span[aria-hidden="true"]').first();
            const published = await timeEl.textContent() || '';

            // Try to extract engagement numbers
            const socialCounts = post.locator('.social-details-social-counts');
            const likesText = await socialCounts.locator('button[aria-label*="like"], button[aria-label*="reaction"]').first().textContent().catch(() => '0');
            const commentsText = await socialCounts.locator('button[aria-label*="comment"]').first().textContent().catch(() => '0');

            results.push({
              platform: 'linkedin',
              author: author.trim(),
              content: content.trim().slice(0, 200),
              url: url.startsWith('http') ? url : `https://www.linkedin.com${url}`,
              engagement: {
                likes: parseInt(likesText?.replace(/\D/g, '') || '0') || 0,
                comments: parseInt(commentsText?.replace(/\D/g, '') || '0') || 0,
                reposts: 0,
              },
              published: published.trim(),
            });
          } catch { /* skip individual post extraction errors */ }
        }
      } catch (err) {
        // Log but continue with next topic
        console.error(`Error searching topic "${topic}": ${err instanceof Error ? err.message : String(err)}`);
      }

      await page.waitForTimeout(randomDelay());
    }

    // Monitor specific people
    for (const person of people.slice(0, config.limits.maxPeople)) {
      try {
        const profileUrl = person.startsWith('http')
          ? `${person}/recent-activity/all/`
          : `https://www.linkedin.com/in/${person}/recent-activity/all/`;
        await page.goto(profileUrl, { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(config.timeouts.pageLoad);

        const posts = await page.locator('.feed-shared-update-v2').all();
        for (const post of posts.slice(0, config.limits.resultsPerPerson)) {
          try {
            const contentEl = post.locator('.feed-shared-update-v2__description, .update-components-text');
            const content = await contentEl.first().textContent() || '';
            const linkEl = post.locator('a[href*="/feed/update/"]').first();
            const url = await linkEl.getAttribute('href') || '';
            const timeEl = post.locator('.update-components-actor__sub-description span[aria-hidden="true"]').first();
            const published = await timeEl.textContent() || '';

            results.push({
              platform: 'linkedin',
              author: person,
              content: content.trim().slice(0, 200),
              url: url.startsWith('http') ? url : `https://www.linkedin.com${url}`,
              engagement: { likes: 0, comments: 0, reposts: 0 },
              published: published.trim(),
            });
          } catch { /* skip */ }
        }
      } catch (err) {
        console.error(`Error checking person "${person}": ${err instanceof Error ? err.message : String(err)}`);
      }

      await page.waitForTimeout(randomDelay());
    }

    // Deduplicate by URL
    const seen = new Set<string>();
    const unique = results.filter(r => {
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });

    // Sort by engagement (likes + comments)
    unique.sort((a, b) => (b.engagement.likes + b.engagement.comments) - (a.engagement.likes + a.engagement.comments));

    // Persist to GitHub (non-blocking)
    const date = new Date().toISOString().split('T')[0];
    persistToGitHub('linkedin', 'discover', date, unique).catch(() => {});

    return {
      success: true,
      message: `Found ${unique.length} interesting LinkedIn posts`,
      data: unique,
    };
  } finally {
    if (context) await context.close();
  }
}

runScript<DiscoverInput>(discoverPosts);
```

- [ ] **Step 5: Create draft-comment.ts**

```typescript
#!/usr/bin/env npx tsx
import { getBrowserContext, runScript, config, ScriptResult } from '../lib/browser.js';

interface DraftCommentInput { post_url: string; comment: string; }

async function draftComment(input: DraftCommentInput): Promise<ScriptResult> {
  if (!input.post_url) return { success: false, message: 'Please provide a post URL' };
  if (!input.comment) return { success: false, message: 'Please provide a comment' };

  let context = null;
  try {
    context = await getBrowserContext();
    const page = context.pages()[0] || await context.newPage();

    await page.goto(input.post_url, { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(config.timeouts.pageLoad);

    // Verify post exists
    const postExists = await page.locator('.feed-shared-update-v2, .scaffold-finite-scroll__content').first().isVisible().catch(() => false);
    if (!postExists) {
      return { success: false, message: 'Post not found. URL may be invalid or post was deleted.' };
    }

    // Get post author and snippet for context
    const author = await page.locator('.update-components-actor__name span[aria-hidden="true"]').first().textContent().catch(() => 'Unknown');
    const content = await page.locator('.feed-shared-update-v2__description, .update-components-text').first().textContent().catch(() => '');

    return {
      success: true,
      message: `Draft comment ready for approval`,
      data: {
        post_url: input.post_url,
        post_author: author?.trim(),
        post_snippet: content?.trim().slice(0, 100),
        draft_comment: input.comment,
      }
    };
  } finally {
    if (context) await context.close();
  }
}

runScript<DraftCommentInput>(draftComment);
```

- [ ] **Step 6: Create comment.ts**

```typescript
#!/usr/bin/env npx tsx
import { getBrowserContext, runScript, config, ScriptResult } from '../lib/browser.js';

interface CommentInput { post_url: string; comment: string; }

async function postComment(input: CommentInput): Promise<ScriptResult> {
  if (!input.post_url) return { success: false, message: 'Please provide a post URL' };
  if (!input.comment) return { success: false, message: 'Please provide a comment' };

  let context = null;
  try {
    context = await getBrowserContext();
    const page = context.pages()[0] || await context.newPage();

    await page.goto(input.post_url, { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(config.timeouts.pageLoad);

    // Click comment button to open comment box
    const commentBtn = page.locator('button[aria-label*="Comment"], button[aria-label*="comment"]').first();
    await commentBtn.waitFor({ timeout: config.timeouts.elementWait });
    await commentBtn.click();
    await page.waitForTimeout(config.timeouts.afterClick);

    // Fill comment
    const commentBox = page.locator('.ql-editor[data-placeholder*="Add a comment"], [role="textbox"][aria-label*="Add a comment"]');
    await commentBox.first().waitFor({ timeout: config.timeouts.elementWait });
    await commentBox.first().click();
    await page.waitForTimeout(config.timeouts.afterClick / 2);
    await commentBox.first().fill(input.comment);
    await page.waitForTimeout(config.timeouts.afterFill);

    // Click submit
    const submitBtn = page.locator('button.comments-comment-box__submit-button');
    await submitBtn.waitFor({ timeout: config.timeouts.elementWait });
    await submitBtn.click();
    await page.waitForTimeout(config.timeouts.afterSubmit);

    return {
      success: true,
      message: `Comment posted: ${input.comment.slice(0, 50)}${input.comment.length > 50 ? '...' : ''}`
    };
  } finally {
    if (context) await context.close();
  }
}

runScript<CommentInput>(postComment);
```

- [ ] **Step 7: Create report.ts**

```typescript
#!/usr/bin/env npx tsx
import { getBrowserContext, runScript, config, ScriptResult } from '../lib/browser.js';
import { persistToGitHub } from '../../content-shared/lib/github-persist.js';

interface ReportInput { period: 'week' | 'month'; }

async function generateReport(input: ReportInput): Promise<ScriptResult> {
  const period = input.period || 'week';
  let context = null;

  try {
    context = await getBrowserContext();
    const page = context.pages()[0] || await context.newPage();

    // Navigate to LinkedIn analytics
    await page.goto('https://www.linkedin.com/analytics/creator/', { timeout: config.timeouts.navigation, waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(config.timeouts.pageLoad * 2);

    // Attempt to get profile overview for follower count
    const report: Record<string, unknown> = {
      platform: 'linkedin',
      period,
      generatedAt: new Date().toISOString(),
      followers: { count: 0, change: 0 },
      impressions: 0,
      engagementRate: 0,
      topPosts: [] as Array<{ content: string; impressions: number; engagement: number }>,
    };

    // Extract follower count from analytics page
    const followerText = await page.locator('[data-test-id="follower-count"], .analytics-followers-count').first().textContent().catch(() => null);
    if (followerText) {
      report.followers = { count: parseInt(followerText.replace(/\D/g, '')) || 0, change: 0 };
    }

    // Extract impressions
    const impressionsText = await page.locator('[data-test-id="impressions-count"], .analytics-impressions').first().textContent().catch(() => null);
    if (impressionsText) {
      report.impressions = parseInt(impressionsText.replace(/\D/g, '')) || 0;
    }

    // Try to extract top posts from the analytics content tab
    try {
      const contentTab = page.locator('button:has-text("Content"), a:has-text("Content")').first();
      if (await contentTab.isVisible().catch(() => false)) {
        await contentTab.click();
        await page.waitForTimeout(config.timeouts.pageLoad);

        const postRows = await page.locator('.analytics-content-table tbody tr, .content-analytics-list-item').all();
        const topPosts: Array<{ content: string; impressions: number; engagement: number }> = [];
        for (const row of postRows.slice(0, 5)) {
          const text = await row.locator('td:first-child, .content-analytics-list-item__text').first().textContent().catch(() => '');
          const imp = await row.locator('td:nth-child(2), .content-analytics-list-item__impressions').first().textContent().catch(() => '0');
          topPosts.push({
            content: text?.trim().slice(0, 100) || '',
            impressions: parseInt(imp?.replace(/\D/g, '') || '0') || 0,
            engagement: 0,
          });
        }
        report.topPosts = topPosts;
      }
    } catch { /* analytics layout may vary */ }

    // Persist report (non-blocking)
    const date = new Date().toISOString().split('T')[0];
    persistToGitHub('linkedin', 'reports', date, report, period).catch(() => {});

    return {
      success: true,
      message: `LinkedIn ${period}ly report generated`,
      data: report,
    };
  } finally {
    if (context) await context.close();
  }
}

runScript<ReportInput>(generateReport);
```

- [ ] **Step 8: Commit**

```bash
git add .claude/skills/linkedin-integration/scripts/
git commit -m "feat: add LinkedIn integration scripts (setup, post, article, discover, comment, report)"
```

---

## Task 4: LinkedIn Integration — Agent & Host

**Files:**
- Create: `.claude/skills/linkedin-integration/agent.ts`
- Create: `.claude/skills/linkedin-integration/host.ts`

- [ ] **Step 1: Create agent.ts (MCP tool registrations)**

```typescript
/**
 * LinkedIn Integration - MCP Tool Registrations (Container Side)
 *
 * Registers tools on the MCP server. Each tool writes an IPC request
 * and polls for results from the host.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

const IPC_DIR = '/workspace/ipc';
const TASKS_DIR = path.join(IPC_DIR, 'tasks');
const RESULTS_DIR = path.join(IPC_DIR, 'linkedin_results');

function writeIpcFile(dir: string, data: object): string {
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const filepath = path.join(dir, filename);
  const tempPath = `${filepath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filepath);
  return filename;
}

async function waitForResult(requestId: string, maxWait: number): Promise<{ success: boolean; message: string; data?: unknown }> {
  const resultFile = path.join(RESULTS_DIR, `${requestId}.json`);
  const pollInterval = 1000;
  let elapsed = 0;
  while (elapsed < maxWait) {
    if (fs.existsSync(resultFile)) {
      try {
        const result = JSON.parse(fs.readFileSync(resultFile, 'utf-8'));
        fs.unlinkSync(resultFile);
        return result;
      } catch (err) {
        return { success: false, message: `Failed to read result: ${err}` };
      }
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    elapsed += pollInterval;
  }
  return { success: false, message: 'Request timed out' };
}

export interface SkillToolsContext {
  groupFolder: string;
  isMain: boolean;
}

export function registerLinkedInTools(server: McpServer, ctx: SkillToolsContext): void {
  const { groupFolder, isMain } = ctx;

  server.tool(
    'linkedin_post',
    'Create a LinkedIn feed post. Main group only. Max 3000 characters.',
    { content: z.string().max(3000).describe('The post content (max 3000 characters)') },
    async (args) => {
      if (!isMain) return { content: [{ type: 'text' as const, text: 'Only the main group can post to LinkedIn.' }], isError: true };
      const requestId = `linkedin_post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      writeIpcFile(TASKS_DIR, { type: 'linkedin_post', requestId, content: args.content, groupFolder, timestamp: new Date().toISOString() });
      const result = await waitForResult(requestId, 300000);
      return { content: [{ type: 'text' as const, text: result.message }], isError: !result.success };
    }
  );

  server.tool(
    'linkedin_article',
    'Publish a LinkedIn article. Main group only. No hard character limit.',
    {
      title: z.string().describe('The article title'),
      content: z.string().describe('The article body (plain text or markdown)')
    },
    async (args) => {
      if (!isMain) return { content: [{ type: 'text' as const, text: 'Only the main group can publish LinkedIn articles.' }], isError: true };
      const requestId = `linkedin_article-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      writeIpcFile(TASKS_DIR, { type: 'linkedin_article', requestId, title: args.title, content: args.content, groupFolder, timestamp: new Date().toISOString() });
      const result = await waitForResult(requestId, 300000);
      return { content: [{ type: 'text' as const, text: result.message }], isError: !result.success };
    }
  );

  server.tool(
    'linkedin_discover',
    'Find interesting LinkedIn posts by topic and/or people. Main group only. Returns posts sorted by engagement.',
    {
      topics: z.array(z.string()).optional().describe('Topics to search for (e.g., ["AI", "startups"])'),
      people: z.array(z.string()).optional().describe('LinkedIn handles or profile URLs to monitor')
    },
    async (args) => {
      if (!isMain) return { content: [{ type: 'text' as const, text: 'Only the main group can use LinkedIn discovery.' }], isError: true };
      const requestId = `linkedin_discover-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      writeIpcFile(TASKS_DIR, { type: 'linkedin_discover', requestId, topics: args.topics, people: args.people, groupFolder, timestamp: new Date().toISOString() });
      const result = await waitForResult(requestId, 600000);
      if (result.data) return { content: [{ type: 'text' as const, text: JSON.stringify(result.data, null, 2) }], isError: false };
      return { content: [{ type: 'text' as const, text: result.message }], isError: !result.success };
    }
  );

  server.tool(
    'linkedin_draft_comment',
    'Draft a comment on a LinkedIn post for user approval. Does NOT post — returns the draft for review.',
    {
      post_url: z.string().describe('The LinkedIn post URL'),
      comment: z.string().describe('The proposed comment text')
    },
    async (args) => {
      if (!isMain) return { content: [{ type: 'text' as const, text: 'Only the main group can comment on LinkedIn.' }], isError: true };
      const requestId = `linkedin_draft_comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      writeIpcFile(TASKS_DIR, { type: 'linkedin_draft_comment', requestId, post_url: args.post_url, comment: args.comment, groupFolder, timestamp: new Date().toISOString() });
      const result = await waitForResult(requestId, 300000);
      if (result.data) return { content: [{ type: 'text' as const, text: JSON.stringify(result.data, null, 2) }], isError: false };
      return { content: [{ type: 'text' as const, text: result.message }], isError: !result.success };
    }
  );

  server.tool(
    'linkedin_comment',
    'Post an approved comment on a LinkedIn post. Only call after user has approved the draft.',
    {
      post_url: z.string().describe('The LinkedIn post URL'),
      comment: z.string().describe('The approved comment text')
    },
    async (args) => {
      if (!isMain) return { content: [{ type: 'text' as const, text: 'Only the main group can comment on LinkedIn.' }], isError: true };
      const requestId = `linkedin_comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      writeIpcFile(TASKS_DIR, { type: 'linkedin_comment', requestId, post_url: args.post_url, comment: args.comment, groupFolder, timestamp: new Date().toISOString() });
      const result = await waitForResult(requestId, 300000);
      return { content: [{ type: 'text' as const, text: result.message }], isError: !result.success };
    }
  );

  server.tool(
    'linkedin_report',
    'Generate a LinkedIn analytics report. Scrapes profile analytics for followers, impressions, engagement, and top posts.',
    { period: z.enum(['week', 'month']).describe('Report period: "week" or "month"') },
    async (args) => {
      if (!isMain) return { content: [{ type: 'text' as const, text: 'Only the main group can generate LinkedIn reports.' }], isError: true };
      const requestId = `linkedin_report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      writeIpcFile(TASKS_DIR, { type: 'linkedin_report', requestId, period: args.period, groupFolder, timestamp: new Date().toISOString() });
      const result = await waitForResult(requestId, 210000);
      if (result.data) return { content: [{ type: 'text' as const, text: JSON.stringify(result.data, null, 2) }], isError: false };
      return { content: [{ type: 'text' as const, text: result.message }], isError: !result.success };
    }
  );
}
```

- [ ] **Step 2: Create host.ts (IPC handler)**

```typescript
/**
 * LinkedIn Integration IPC Handler
 * Handles all linkedin_* IPC messages from container agents.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: { target: 'pino-pretty', options: { colorize: true } }
});

interface SkillResult {
  success: boolean;
  message: string;
  data?: unknown;
}

async function runScript(script: string, args: object): Promise<SkillResult> {
  const scriptPath = path.join(process.cwd(), '.claude', 'skills', 'linkedin-integration', 'scripts', `${script}.ts`);

  return new Promise((resolve) => {
    const proc = spawn('npx', ['tsx', scriptPath], {
      cwd: process.cwd(),
      env: { ...process.env, NANOCLAW_ROOT: process.cwd() },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    proc.stdout.on('data', (data) => { stdout += data.toString(); });
    proc.stdin.write(JSON.stringify(args));
    proc.stdin.end();

    const timeoutMs = ['discover', 'report'].includes(script) ? 180000 : 120000;
    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      resolve({ success: false, message: `Script timed out (${timeoutMs / 1000}s)` });
    }, timeoutMs);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve({ success: false, message: `Script exited with code: ${code}` });
        return;
      }
      try {
        const lines = stdout.trim().split('\n');
        resolve(JSON.parse(lines[lines.length - 1]));
      } catch {
        resolve({ success: false, message: `Failed to parse output: ${stdout.slice(0, 200)}` });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({ success: false, message: `Failed to spawn: ${err.message}` });
    });
  });
}

function writeResult(dataDir: string, sourceGroup: string, requestId: string, result: SkillResult): void {
  const resultsDir = path.join(dataDir, 'ipc', sourceGroup, 'linkedin_results');
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(path.join(resultsDir, `${requestId}.json`), JSON.stringify(result));
}

export async function handleLinkedInIpc(
  data: Record<string, unknown>,
  sourceGroup: string,
  isMain: boolean,
  dataDir: string
): Promise<boolean> {
  const type = data.type as string;
  if (!type?.startsWith('linkedin_')) return false;

  if (!isMain) {
    logger.warn({ sourceGroup, type }, 'LinkedIn integration blocked: not main group');
    return true;
  }

  const requestId = data.requestId as string;
  if (!requestId) {
    logger.warn({ type }, 'LinkedIn integration blocked: missing requestId');
    return true;
  }

  logger.info({ type, requestId }, 'Processing LinkedIn request');
  let result: SkillResult;

  switch (type) {
    case 'linkedin_post':
      result = data.content ? await runScript('post', { content: data.content }) : { success: false, message: 'Missing content' };
      break;
    case 'linkedin_article':
      result = (data.title && data.content) ? await runScript('article', { title: data.title, content: data.content }) : { success: false, message: 'Missing title or content' };
      break;
    case 'linkedin_discover':
      result = await runScript('discover', { topics: data.topics, people: data.people });
      break;
    case 'linkedin_draft_comment':
      result = (data.post_url && data.comment) ? await runScript('draft-comment', { post_url: data.post_url, comment: data.comment }) : { success: false, message: 'Missing post_url or comment' };
      break;
    case 'linkedin_comment':
      result = (data.post_url && data.comment) ? await runScript('comment', { post_url: data.post_url, comment: data.comment }) : { success: false, message: 'Missing post_url or comment' };
      break;
    case 'linkedin_report':
      result = await runScript('report', { period: data.period || 'week' });
      break;
    default:
      return false;
  }

  writeResult(dataDir, sourceGroup, requestId, result);
  if (result.success) {
    logger.info({ type, requestId }, 'LinkedIn request completed');
  } else {
    logger.error({ type, requestId, message: result.message }, 'LinkedIn request failed');
  }
  return true;
}
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/linkedin-integration/agent.ts .claude/skills/linkedin-integration/host.ts
git commit -m "feat: add LinkedIn integration agent (MCP tools) and host (IPC handler)"
```

---

## Task 5: Twitter Content — Full Skill

**Files:**
- Create: `.claude/skills/twitter-content/lib/config.ts`
- Create: `.claude/skills/twitter-content/lib/browser.ts`
- Create: `.claude/skills/twitter-content/scripts/setup.ts`
- Create: `.claude/skills/twitter-content/scripts/post.ts`
- Create: `.claude/skills/twitter-content/scripts/discover.ts`
- Create: `.claude/skills/twitter-content/scripts/draft-reply.ts`
- Create: `.claude/skills/twitter-content/scripts/reply.ts`
- Create: `.claude/skills/twitter-content/scripts/report.ts`
- Create: `.claude/skills/twitter-content/agent.ts`
- Create: `.claude/skills/twitter-content/host.ts`

Follow the same pattern as LinkedIn integration (Task 2-4) with these key differences:

- [ ] **Step 1: Create lib/config.ts**

Same structure as LinkedIn config but:
- `browserDataDir`: `data/x-browser-profile` (reuse X-integration's profile to avoid double login)
- `authPath`: `data/x-auth.json` (reuse X-integration's auth marker)
- `limits.postMaxLength`: 280
- URLs: `x.com` / `analytics.x.com`

- [ ] **Step 2: Create lib/browser.ts**

Same as LinkedIn's browser.ts but:
- `validateContent` uses 280-char limit
- `extractTweetId` helper (copied from X-integration: `.claude/skills/x-integration/lib/browser.ts:94-99`)
- `navigateToTweet` helper (copied from X-integration: `.claude/skills/x-integration/lib/browser.ts:104-129`)

- [ ] **Step 3: Create scripts/setup.ts**

Check if `data/x-auth.json` already exists (from X-integration). If so, skip setup and print "X authentication already configured." Otherwise, follow the X-integration setup pattern (`scripts/setup.ts`).

- [ ] **Step 4: Create scripts/post.ts**

Copy pattern from `.claude/skills/x-integration/scripts/post.ts` — it's the same action.

- [ ] **Step 5: Create scripts/discover.ts**

Same pattern as LinkedIn discover but:
- Search URL: `https://x.com/search?q=${encodeURIComponent(topic)}&f=top`
- Post selector: `article[data-testid="tweet"]`
- Author: `[data-testid="User-Name"] span` inside article
- Content: `[data-testid="tweetText"]` inside article
- URL: extract from `a[href*="/status/"]` inside article
- Engagement: `[data-testid="like"]`, `[data-testid="reply"]`, `[data-testid="retweet"]` aria-labels
- People monitoring: `https://x.com/{handle}`

- [ ] **Step 6: Create scripts/draft-reply.ts**

Navigate to tweet URL, verify it exists, return draft context (tweet author, snippet, proposed reply). Does NOT post.

- [ ] **Step 7: Create scripts/reply.ts**

Copy pattern from `.claude/skills/x-integration/scripts/reply.ts` — same Playwright selectors.

- [ ] **Step 8: Create scripts/report.ts**

Same pattern as LinkedIn report but:
- Navigate to `https://analytics.x.com` or fall back to `https://x.com/{username}`
- Extract: follower count, tweet impressions, engagement rate
- Persist to GitHub as `reports/twitter/{date}-{period}.json`

- [ ] **Step 9: Create agent.ts**

Same pattern as LinkedIn agent.ts but:
- Tool names: `tw_post`, `tw_discover`, `tw_draft_reply`, `tw_reply`, `tw_report`
- Results dir: `tw_results`
- Character limit: 280 for `tw_post`
- No `tw_article` tool

- [ ] **Step 10: Create host.ts**

Same pattern as LinkedIn host.ts but:
- Type prefix: `tw_*`
- Script path: `.claude/skills/twitter-content/scripts/`
- Results dir: `tw_results`

- [ ] **Step 11: Commit**

```bash
git add .claude/skills/twitter-content/
git commit -m "feat: add Twitter content skill (post, discover, draft-reply, reply, report)"
```

---

## Task 6: YouTube Integration — Full Skill

**Files:**
- Create: `.claude/skills/youtube-integration/lib/config.ts`
- Create: `.claude/skills/youtube-integration/lib/browser.ts`
- Create: `.claude/skills/youtube-integration/scripts/setup.ts`
- Create: `.claude/skills/youtube-integration/scripts/discover.ts`
- Create: `.claude/skills/youtube-integration/scripts/report.ts`
- Create: `.claude/skills/youtube-integration/agent.ts`
- Create: `.claude/skills/youtube-integration/host.ts`

- [ ] **Step 1: Create lib/config.ts**

Same structure but:
- `browserDataDir`: `data/youtube-browser-profile`
- `authPath`: `data/youtube-auth.json`
- No `postMaxLength` limit
- URLs: `youtube.com`, `studio.youtube.com`

- [ ] **Step 2: Create lib/browser.ts**

Simpler than LinkedIn/Twitter — no `validateContent` needed. Just `getBrowserContext`, `readInput`, `writeResult`, `runScript`, `randomDelay`, `cleanupLockFiles`.

- [ ] **Step 3: Create scripts/setup.ts**

Same pattern but:
- Navigate to `https://accounts.google.com/signin` then `https://studio.youtube.com`
- Verify login by checking for YouTube Studio dashboard elements
- Save to `data/youtube-auth.json`

- [ ] **Step 4: Create scripts/discover.ts**

- Search URL: `https://www.youtube.com/results?search_query=${encodeURIComponent(topic)}&sp=CAI%253D` (sorted by upload date)
- Video selector: `ytd-video-renderer`
- Title: `#video-title` text
- Channel: `ytd-channel-name` text
- Views: `#metadata-line span` first
- URL: `#video-title` href
- Channel monitoring: `https://www.youtube.com/@{channel}/videos`
- Persist to GitHub as `discover/youtube/{date}.json`

- [ ] **Step 5: Create scripts/report.ts**

- Navigate to `https://studio.youtube.com/channel/UC.../analytics`
- Extract: subscriber count, total views, watch time, top videos
- YouTube Studio uses shadow DOM and custom elements — may need `page.evaluate()` for extraction
- Persist to GitHub as `reports/youtube/{date}-{period}.json`

- [ ] **Step 6: Create agent.ts**

Two tools only:
- `yt_discover`: topics (string[]), channels (string[], optional) → discovery results
- `yt_report`: period ("week" | "month") → analytics report
- Results dir: `yt_results`

- [ ] **Step 7: Create host.ts**

Type prefix: `yt_*`, only two switch cases: `yt_discover` and `yt_report`.

- [ ] **Step 8: Commit**

```bash
git add .claude/skills/youtube-integration/
git commit -m "feat: add YouTube integration skill (discover, report)"
```

---

## Task 7: Wire Into NanoClaw — Host Side

**Files:**
- Modify: `src/ipc.ts:468-469` (default case)
- Modify: `.env` (add empty env vars)

- [ ] **Step 1: Add imports to src/ipc.ts**

At the top of `src/ipc.ts`, after the existing imports (line 12), add:

```typescript
import { handleXIpc } from '../.claude/skills/x-integration/host.js';
import { handleLinkedInIpc } from '../.claude/skills/linkedin-integration/host.js';
import { handleTwitterContentIpc } from '../.claude/skills/twitter-content/host.js';
import { handleYouTubeIpc } from '../.claude/skills/youtube-integration/host.js';
```

> **Note:** This also wires in the existing X-integration's `handleXIpc` which was designed but never integrated into `src/ipc.ts`.

- [ ] **Step 2: Replace default case in processTaskIpc**

In `src/ipc.ts`, find line 468-469:

```typescript
    default:
      logger.warn({ type: data.type }, 'Unknown IPC task type');
```

Replace with:

```typescript
    default: {
      const handled =
        await handleXIpc(data, sourceGroup, isMain, DATA_DIR) ||
        await handleLinkedInIpc(data, sourceGroup, isMain, DATA_DIR) ||
        await handleTwitterContentIpc(data, sourceGroup, isMain, DATA_DIR) ||
        await handleYouTubeIpc(data, sourceGroup, isMain, DATA_DIR);
      if (!handled) {
        logger.warn({ type: data.type }, 'Unknown IPC task type');
      }
    }
```

- [ ] **Step 3: Add empty env vars to .env**

Append to `.env`:

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

- [ ] **Step 4: Build and verify**

Run: `npm run build`
Expected: Clean compilation with no errors

- [ ] **Step 5: Commit**

```bash
git add src/ipc.ts .env
git commit -m "feat: wire content manager skills into host IPC handler"
```

---

## Task 8: Wire Into NanoClaw — Container Side

**Files:**
- Modify: `container/agent-runner/src/ipc-mcp-stdio.ts:337` (before transport connect)
- Modify: `container/Dockerfile`
- Modify: `container/build.sh`

- [ ] **Step 1: Add tool registrations to ipc-mcp-stdio.ts**

Before the transport connection at line 337 (`const transport = new StdioServerTransport()`), add dynamic imports. These files only exist in the container (COPY'd during Docker build), so use try/catch to gracefully handle when skills aren't installed:

```typescript
// Register content manager skill tools (COPY'd during Docker build)
try {
  const { registerLinkedInTools } = await import('./skills/linkedin-integration/agent.js');
  registerLinkedInTools(server, { groupFolder, isMain });
} catch { /* skill not installed */ }

try {
  const { registerTwitterContentTools } = await import('./skills/twitter-content/agent.js');
  registerTwitterContentTools(server, { groupFolder, isMain });
} catch { /* skill not installed */ }

try {
  const { registerYouTubeTools } = await import('./skills/youtube-integration/agent.js');
  registerYouTubeTools(server, { groupFolder, isMain });
} catch { /* skill not installed */ }
```

- [ ] **Step 2: Update Dockerfile**

Since `build.sh` changes the build context from `container/` to the project root (Step 3 below), **ALL existing COPY paths** must be updated. This is critical — without these changes the Docker build will fail.

Change line 40 from:
```dockerfile
COPY agent-runner/package*.json ./
```
To:
```dockerfile
COPY container/agent-runner/package*.json ./
```

Change line 46 from:
```dockerfile
COPY agent-runner/ ./
```
To:
```dockerfile
COPY container/agent-runner/ ./
```

Then add these lines after `COPY container/agent-runner/ ./` and before `RUN npm run build`:

```dockerfile
# Copy content manager skill MCP tools
COPY .claude/skills/linkedin-integration/agent.ts ./src/skills/linkedin-integration/
COPY .claude/skills/twitter-content/agent.ts ./src/skills/twitter-content/
COPY .claude/skills/youtube-integration/agent.ts ./src/skills/youtube-integration/
```

- [ ] **Step 3: Update build.sh**

Change line 16 from:

```bash
${CONTAINER_RUNTIME} build -t "${IMAGE_NAME}:${TAG}" .
```

To:

```bash
cd "$SCRIPT_DIR/.."
${CONTAINER_RUNTIME} build -t "${IMAGE_NAME}:${TAG}" -f container/Dockerfile .
```

- [ ] **Step 4: Verify container builds**

Run: `./container/build.sh`
Expected: Build succeeds, output shows COPY lines for skill agent.ts files

- [ ] **Step 5: Commit**

```bash
git add container/agent-runner/src/ipc-mcp-stdio.ts container/Dockerfile container/build.sh
git commit -m "feat: wire content manager tools into container MCP server"
```

---

## Task 9: SKILL.md Documentation

**Files:**
- Create: `.claude/skills/linkedin-integration/SKILL.md`
- Create: `.claude/skills/twitter-content/SKILL.md`
- Create: `.claude/skills/youtube-integration/SKILL.md`

- [ ] **Step 1: Create LinkedIn SKILL.md**

Follow the exact structure of `.claude/skills/x-integration/SKILL.md`. Include:
- Frontmatter (name, description, triggers)
- Features table
- Prerequisites
- Quick Start (setup, rebuild container, restart service)
- Configuration (env vars, config.ts, data directories)
- Architecture diagram
- File structure
- Integration points (already done — reference them)
- Setup steps
- Usage examples
- Testing commands
- Troubleshooting (auth expired, lock files, selector changes)
- Security notes

- [ ] **Step 2: Create Twitter Content SKILL.md**

Same structure. Note the relationship with existing X-integration and shared browser profile.

- [ ] **Step 3: Create YouTube SKILL.md**

Same structure but simpler (only 2 tools: discover + report).

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/linkedin-integration/SKILL.md .claude/skills/twitter-content/SKILL.md .claude/skills/youtube-integration/SKILL.md
git commit -m "docs: add SKILL.md documentation for all content manager skills"
```

---

## Task 10: Build, Test & Verify

- [ ] **Step 1: Build host**

Run: `npm run build`
Expected: Clean compilation

- [ ] **Step 2: Test LinkedIn setup interactively**

Run: `npx dotenv -e .env -- npx tsx .claude/skills/linkedin-integration/scripts/setup.ts`
Expected: Opens Chrome, user logs in, auth marker saved

- [ ] **Step 3: Test Twitter setup**

Run: `npx dotenv -e .env -- npx tsx .claude/skills/twitter-content/scripts/setup.ts`
Expected: Detects existing X-integration auth or opens Chrome for login

- [ ] **Step 4: Test YouTube setup**

Run: `npx dotenv -e .env -- npx tsx .claude/skills/youtube-integration/scripts/setup.ts`
Expected: Opens Chrome, user logs in to Google/YouTube, auth marker saved

- [ ] **Step 5: Rebuild container**

Run: `./container/build.sh`
Expected: Build succeeds with COPY lines for all three skills

- [ ] **Step 6: Test a LinkedIn post (will actually post)**

Run: `echo '{"content":"Testing NanoClaw LinkedIn integration - please ignore"}' | npx dotenv -e .env -- npx tsx .claude/skills/linkedin-integration/scripts/post.ts`
Expected: `{"success":true,"message":"LinkedIn post created: Testing NanoClaw..."}`

- [ ] **Step 7: Restart service**

```bash
npm run build
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

- [ ] **Step 8: Commit final state**

```bash
git add -A
git commit -m "feat: content manager tools complete — LinkedIn, Twitter, YouTube"
```
