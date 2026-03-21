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
