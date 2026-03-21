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
      const fd = fs.openSync(LOCK_FILE, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return true;
    } catch {
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
  platform: string,
  category: string,
  date: string,
  data: object,
  suffix?: string
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

    if (!fs.existsSync(path.join(CLONE_DIR, '.git'))) {
      fs.mkdirSync(CLONE_DIR, { recursive: true });
      execSync(`git clone --depth 1 ${repoUrl} ${CLONE_DIR}`, { stdio: 'pipe' });
    } else {
      execSync('git pull --rebase', { cwd: CLONE_DIR, stdio: 'pipe' });
    }

    const filename = suffix ? `${date}-${suffix}.json` : `${date}.json`;
    const dirPath = path.join(CLONE_DIR, category, platform);
    fs.mkdirSync(dirPath, { recursive: true });
    const filePath = path.join(dirPath, filename);

    let fileData: unknown;
    if (fs.existsSync(filePath)) {
      const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (Array.isArray(existing) && Array.isArray(data)) {
        fileData = [...existing, ...data];
      } else if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
        fileData = data;
      } else {
        fileData = data;
      }
    } else {
      fileData = data;
    }

    fs.writeFileSync(filePath, JSON.stringify(fileData, null, 2));

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
