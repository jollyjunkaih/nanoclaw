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
