/**
 * Twitter Content IPC Handler
 * Handles all tw_* IPC messages from container agents.
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
  const scriptPath = path.join(process.cwd(), '.claude', 'skills', 'twitter-content', 'scripts', `${script}.ts`);

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
  const resultsDir = path.join(dataDir, 'ipc', sourceGroup, 'tw_results');
  fs.mkdirSync(resultsDir, { recursive: true });
  fs.writeFileSync(path.join(resultsDir, `${requestId}.json`), JSON.stringify(result));
}

export async function handleTwitterContentIpc(
  data: Record<string, unknown>,
  sourceGroup: string,
  isMain: boolean,
  dataDir: string
): Promise<boolean> {
  const type = data.type as string;
  if (!type?.startsWith('tw_')) return false;

  if (!isMain) {
    logger.warn({ sourceGroup, type }, 'Twitter content blocked: not main group');
    return true;
  }

  const requestId = data.requestId as string;
  if (!requestId) {
    logger.warn({ type }, 'Twitter content blocked: missing requestId');
    return true;
  }

  logger.info({ type, requestId }, 'Processing Twitter request');
  let result: SkillResult;

  switch (type) {
    case 'tw_post':
      result = data.content ? await runScript('post', { content: data.content }) : { success: false, message: 'Missing content' };
      break;
    case 'tw_discover':
      result = await runScript('discover', { topics: data.topics, people: data.people });
      break;
    case 'tw_draft_reply':
      result = (data.tweet_url && data.reply) ? await runScript('draft-reply', { tweet_url: data.tweet_url, reply: data.reply }) : { success: false, message: 'Missing tweet_url or reply' };
      break;
    case 'tw_reply':
      result = (data.tweet_url && data.content) ? await runScript('reply', { tweetUrl: data.tweet_url, content: data.content }) : { success: false, message: 'Missing tweet_url or content' };
      break;
    case 'tw_report':
      result = await runScript('report', { period: data.period || 'week' });
      break;
    default:
      return false;
  }

  writeResult(dataDir, sourceGroup, requestId, result);
  if (result.success) {
    logger.info({ type, requestId }, 'Twitter request completed');
  } else {
    logger.error({ type, requestId, message: result.message }, 'Twitter request failed');
  }
  return true;
}
