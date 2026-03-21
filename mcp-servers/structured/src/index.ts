import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runShortcut } from './shortcuts.js';

const SHORTCUT_MISSING_HINT =
  'Please open Shortcuts.app on your Mac and create the missing shortcut. ' +
  'The shortcut should invoke the corresponding Structured AppIntent and return its output as text.';

function handleShortcutError(name: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (
    message.includes('No shortcut with that name') ||
    message.includes('not found') ||
    message.includes('couldn\'t be run')
  ) {
    return (
      `Shortcut "${name}" does not exist. ${SHORTCUT_MISSING_HINT}`
    );
  }
  return `Error running shortcut "${name}": ${message}`;
}

const server = new McpServer({
  name: 'nanoclaw-structured',
  version: '1.0.0',
});

// ── get_today_schedule ────────────────────────────────────────────────────────

server.registerTool(
  'get_today_schedule',
  {
    description:
      "Get today's tasks from the Structured day planner app. " +
      'Requires a Shortcuts.app shortcut named "NanoClaw - Today\'s Schedule" ' +
      'that invokes Structured\'s DayScheduleIntent for today.',
    inputSchema: z.object({}),
  },
  async () => {
    const shortcutName = "NanoClaw - Today's Schedule";
    try {
      const output = await runShortcut(shortcutName);
      return { content: [{ type: 'text', text: output || '(no output returned by shortcut)' }] };
    } catch (err) {
      return { content: [{ type: 'text', text: handleShortcutError(shortcutName, err) }] };
    }
  },
);

// ── get_tasks ─────────────────────────────────────────────────────────────────

server.registerTool(
  'get_tasks',
  {
    description:
      'Get tasks from the Structured day planner app for a specific date. ' +
      'Requires a Shortcuts.app shortcut named "NanoClaw - Day Schedule" ' +
      'that accepts a date string input and invokes Structured\'s DayScheduleIntent.',
    inputSchema: z.object({
      date: z
        .string()
        .describe(
          'Date to fetch tasks for. Accepts ISO format (e.g. 2024-01-15), ' +
            'or natural language like "today", "tomorrow", "yesterday".',
        ),
    }),
  },
  async ({ date }) => {
    const shortcutName = 'NanoClaw - Day Schedule';
    try {
      const output = await runShortcut(shortcutName, date);
      return { content: [{ type: 'text', text: output || '(no output returned by shortcut)' }] };
    } catch (err) {
      return { content: [{ type: 'text', text: handleShortcutError(shortcutName, err) }] };
    }
  },
);

// ── get_current_task ──────────────────────────────────────────────────────────

server.registerTool(
  'get_current_task',
  {
    description:
      'Get the currently active/running task from the Structured day planner app. ' +
      'Requires a Shortcuts.app shortcut named "NanoClaw - Current Task" ' +
      'that invokes Structured\'s GetCurrentTaskIntent.',
    inputSchema: z.object({}),
  },
  async () => {
    const shortcutName = 'NanoClaw - Current Task';
    try {
      const output = await runShortcut(shortcutName);
      return { content: [{ type: 'text', text: output || '(no task is currently active)' }] };
    } catch (err) {
      return { content: [{ type: 'text', text: handleShortcutError(shortcutName, err) }] };
    }
  },
);

// ── add_task ──────────────────────────────────────────────────────────────────

server.registerTool(
  'add_task',
  {
    description:
      'Add a new task to the Structured day planner app. ' +
      'Requires a Shortcuts.app shortcut named "NanoClaw - Add Task" ' +
      'that accepts JSON input and invokes Structured\'s AddTaskIntent.',
    inputSchema: z.object({
      title: z.string().describe('Task title'),
      start_time: z
        .string()
        .optional()
        .describe('Task start time in ISO format (e.g. 2024-01-15T09:00:00) or HH:MM'),
      duration: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Task duration in minutes'),
    }),
  },
  async ({ title, start_time, duration }) => {
    const shortcutName = 'NanoClaw - Add Task';
    const payload: Record<string, unknown> = { title };
    if (start_time !== undefined) payload.start_time = start_time;
    if (duration !== undefined) payload.duration = duration;

    try {
      const output = await runShortcut(shortcutName, JSON.stringify(payload));
      return { content: [{ type: 'text', text: output || 'Task added successfully.' }] };
    } catch (err) {
      return { content: [{ type: 'text', text: handleShortcutError(shortcutName, err) }] };
    }
  },
);

// ── complete_task ─────────────────────────────────────────────────────────────

server.registerTool(
  'complete_task',
  {
    description:
      'Mark a task as complete (or toggle its completion) in the Structured day planner app. ' +
      'Requires a Shortcuts.app shortcut named "NanoClaw - Complete Task" ' +
      'that accepts a Structured task URL and invokes Structured\'s ToggleTaskIntent. ' +
      'Task URLs have the form structured://task/<uuid>.',
    inputSchema: z.object({
      task_url: z
        .string()
        .describe('Structured task URL in the form structured://task/<uuid>'),
    }),
  },
  async ({ task_url }) => {
    const shortcutName = 'NanoClaw - Complete Task';
    try {
      const output = await runShortcut(shortcutName, task_url);
      return { content: [{ type: 'text', text: output || 'Task completion toggled successfully.' }] };
    } catch (err) {
      return { content: [{ type: 'text', text: handleShortcutError(shortcutName, err) }] };
    }
  },
);

// ── start server ──────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
