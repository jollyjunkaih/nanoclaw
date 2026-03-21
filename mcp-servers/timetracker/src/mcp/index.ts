import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  logTime,
  getTimesheet,
  updateEntry,
  deleteEntry,
  getDailyReport,
  getWeeklyReport,
  getMonthlyReport,
  getCategories,
  createCategory,
} from '../db/queries.js';

const server = new McpServer({ name: 'timetracker', version: '1.0.0' });

// Helper: look up category id by name, creating it if it doesn't exist.
function resolveCategory(categoryName: string): number {
  const categories = getCategories();
  const existing = categories.find(
    (c) => c.name.toLowerCase() === categoryName.toLowerCase()
  );
  if (existing) return existing.id;
  return createCategory(categoryName);
}

// 1. log_time
server.tool(
  'log_time',
  'Log a time entry for an activity.',
  {
    date: z.string().describe('Date in YYYY-MM-DD format'),
    start_time: z.string().describe('Start time in HH:MM format'),
    end_time: z.string().describe('End time in HH:MM format'),
    activity: z.string().describe('Description of the activity'),
    category: z.string().optional().describe('Category name (auto-created if new)'),
    expected_activity: z.string().optional().describe('What was planned for this time'),
  },
  async (args) => {
    const category_id = args.category ? resolveCategory(args.category) : null;
    const id = logTime({
      date: args.date,
      start_time: args.start_time,
      end_time: args.end_time,
      activity: args.activity,
      category_id,
      expected_activity: args.expected_activity ?? null,
    });
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ id, success: true }) }],
    };
  }
);

// 2. get_timesheet
server.tool(
  'get_timesheet',
  'Retrieve time entries for a date or date range.',
  {
    date: z.string().describe('Start date in YYYY-MM-DD format'),
    end_date: z.string().optional().describe('End date in YYYY-MM-DD format (inclusive)'),
  },
  async (args) => {
    const entries = getTimesheet(args.date, args.end_date);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(entries) }],
    };
  }
);

// 3. update_entry
server.tool(
  'update_entry',
  'Update an existing time entry by id.',
  {
    id: z.number().describe('Time entry id'),
    activity: z.string().optional().describe('New activity description'),
    start_time: z.string().optional().describe('New start time in HH:MM format'),
    end_time: z.string().optional().describe('New end time in HH:MM format'),
    category: z.string().optional().describe('New category name (auto-created if new)'),
  },
  async (args) => {
    const updates: Record<string, unknown> = {};
    if (args.activity !== undefined) updates.activity = args.activity;
    if (args.start_time !== undefined) updates.start_time = args.start_time;
    if (args.end_time !== undefined) updates.end_time = args.end_time;
    if (args.category !== undefined) {
      updates.category_id = resolveCategory(args.category);
    }
    updateEntry(args.id, updates as Parameters<typeof updateEntry>[1]);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ success: true }) }],
    };
  }
);

// 4. delete_entry
server.tool(
  'delete_entry',
  'Delete a time entry by id.',
  {
    id: z.number().describe('Time entry id'),
  },
  async (args) => {
    deleteEntry(args.id);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify({ success: true }) }],
    };
  }
);

// 5. get_daily_report
server.tool(
  'get_daily_report',
  'Get a summary report for a single day.',
  {
    date: z.string().describe('Date in YYYY-MM-DD format'),
  },
  async (args) => {
    const report = getDailyReport(args.date);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(report) }],
    };
  }
);

// 6. get_weekly_report
server.tool(
  'get_weekly_report',
  'Get daily hour totals for a week starting on the given Monday.',
  {
    start_date: z.string().describe('Monday of the week in YYYY-MM-DD format'),
  },
  async (args) => {
    const report = getWeeklyReport(args.start_date);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(report) }],
    };
  }
);

// 7. get_monthly_report
server.tool(
  'get_monthly_report',
  'Get weekly aggregated hours for a given month.',
  {
    month: z.string().describe('Month in YYYY-MM format'),
  },
  async (args) => {
    const report = getMonthlyReport(args.month);
    return {
      content: [{ type: 'text' as const, text: JSON.stringify(report) }],
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
