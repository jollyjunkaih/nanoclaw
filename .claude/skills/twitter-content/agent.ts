/**
 * Twitter Content - MCP Tool Registrations (Container Side)
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
const RESULTS_DIR = path.join(IPC_DIR, 'tw_results');

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

export function registerTwitterContentTools(server: McpServer, ctx: SkillToolsContext): void {
  const { groupFolder, isMain } = ctx;

  server.tool(
    'tw_post',
    'Post a tweet to X/Twitter. Main group only. Max 280 characters.',
    { content: z.string().max(280).describe('The tweet content (max 280 characters)') },
    async (args) => {
      if (!isMain) return { content: [{ type: 'text' as const, text: 'Only the main group can post to Twitter.' }], isError: true };
      const requestId = `tw_post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      writeIpcFile(TASKS_DIR, { type: 'tw_post', requestId, content: args.content, groupFolder, timestamp: new Date().toISOString() });
      const result = await waitForResult(requestId, 300000);
      return { content: [{ type: 'text' as const, text: result.message }], isError: !result.success };
    }
  );

  server.tool(
    'tw_discover',
    'Find interesting tweets by topic and/or people. Main group only. Returns tweets sorted by engagement.',
    {
      topics: z.array(z.string()).optional().describe('Topics to search for (e.g., ["AI", "startups"])'),
      people: z.array(z.string()).optional().describe('Twitter handles to monitor (e.g., ["@elonmusk", "sama"])')
    },
    async (args) => {
      if (!isMain) return { content: [{ type: 'text' as const, text: 'Only the main group can use Twitter discovery.' }], isError: true };
      const requestId = `tw_discover-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      writeIpcFile(TASKS_DIR, { type: 'tw_discover', requestId, topics: args.topics, people: args.people, groupFolder, timestamp: new Date().toISOString() });
      const result = await waitForResult(requestId, 600000);
      if (result.data) return { content: [{ type: 'text' as const, text: JSON.stringify(result.data, null, 2) }], isError: false };
      return { content: [{ type: 'text' as const, text: result.message }], isError: !result.success };
    }
  );

  server.tool(
    'tw_draft_reply',
    'Draft a reply to a tweet for user approval. Does NOT post — returns the draft for review.',
    {
      tweet_url: z.string().describe('The tweet URL'),
      reply: z.string().max(280).describe('The proposed reply text (max 280 characters)')
    },
    async (args) => {
      if (!isMain) return { content: [{ type: 'text' as const, text: 'Only the main group can reply to tweets.' }], isError: true };
      const requestId = `tw_draft_reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      writeIpcFile(TASKS_DIR, { type: 'tw_draft_reply', requestId, tweet_url: args.tweet_url, reply: args.reply, groupFolder, timestamp: new Date().toISOString() });
      const result = await waitForResult(requestId, 300000);
      if (result.data) return { content: [{ type: 'text' as const, text: JSON.stringify(result.data, null, 2) }], isError: false };
      return { content: [{ type: 'text' as const, text: result.message }], isError: !result.success };
    }
  );

  server.tool(
    'tw_reply',
    'Post an approved reply to a tweet. Only call after user has approved the draft.',
    {
      tweet_url: z.string().describe('The tweet URL'),
      content: z.string().max(280).describe('The approved reply text (max 280 characters)')
    },
    async (args) => {
      if (!isMain) return { content: [{ type: 'text' as const, text: 'Only the main group can reply to tweets.' }], isError: true };
      const requestId = `tw_reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      writeIpcFile(TASKS_DIR, { type: 'tw_reply', requestId, tweet_url: args.tweet_url, content: args.content, groupFolder, timestamp: new Date().toISOString() });
      const result = await waitForResult(requestId, 300000);
      return { content: [{ type: 'text' as const, text: result.message }], isError: !result.success };
    }
  );

  server.tool(
    'tw_report',
    'Generate a Twitter/X analytics report. Scrapes profile and analytics for followers, impressions, engagement, and top tweets.',
    { period: z.enum(['week', 'month']).describe('Report period: "week" or "month"') },
    async (args) => {
      if (!isMain) return { content: [{ type: 'text' as const, text: 'Only the main group can generate Twitter reports.' }], isError: true };
      const requestId = `tw_report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      writeIpcFile(TASKS_DIR, { type: 'tw_report', requestId, period: args.period, groupFolder, timestamp: new Date().toISOString() });
      const result = await waitForResult(requestId, 210000);
      if (result.data) return { content: [{ type: 'text' as const, text: JSON.stringify(result.data, null, 2) }], isError: false };
      return { content: [{ type: 'text' as const, text: result.message }], isError: !result.success };
    }
  );
}
