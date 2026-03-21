/**
 * YouTube Integration - MCP Tool Registrations (Container Side)
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
const RESULTS_DIR = path.join(IPC_DIR, 'yt_results');

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

export function registerYouTubeTools(server: McpServer, ctx: SkillToolsContext): void {
  const { groupFolder, isMain } = ctx;

  server.tool(
    'yt_discover',
    'Find recent YouTube videos by topic and/or channel. Main group only. Returns videos sorted by recency.',
    {
      topics: z.array(z.string()).optional().describe('Topics to search for (e.g., ["AI", "machine learning"])'),
      channels: z.array(z.string()).optional().describe('YouTube channel handles to monitor (e.g., ["@mkbhd", "@veritasium"])')
    },
    async (args) => {
      if (!isMain) return { content: [{ type: 'text' as const, text: 'Only the main group can use YouTube discovery.' }], isError: true };
      const requestId = `yt_discover-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      writeIpcFile(TASKS_DIR, { type: 'yt_discover', requestId, topics: args.topics, channels: args.channels, groupFolder, timestamp: new Date().toISOString() });
      const result = await waitForResult(requestId, 600000);
      if (result.data) return { content: [{ type: 'text' as const, text: JSON.stringify(result.data, null, 2) }], isError: false };
      return { content: [{ type: 'text' as const, text: result.message }], isError: !result.success };
    }
  );

  server.tool(
    'yt_report',
    'Generate a YouTube Studio analytics report. Scrapes channel analytics for subscribers, views, watch time, and top videos.',
    { period: z.enum(['week', 'month']).describe('Report period: "week" or "month"') },
    async (args) => {
      if (!isMain) return { content: [{ type: 'text' as const, text: 'Only the main group can generate YouTube reports.' }], isError: true };
      const requestId = `yt_report-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      writeIpcFile(TASKS_DIR, { type: 'yt_report', requestId, period: args.period, groupFolder, timestamp: new Date().toISOString() });
      const result = await waitForResult(requestId, 210000);
      if (result.data) return { content: [{ type: 'text' as const, text: JSON.stringify(result.data, null, 2) }], isError: false };
      return { content: [{ type: 'text' as const, text: result.message }], isError: !result.success };
    }
  );
}
