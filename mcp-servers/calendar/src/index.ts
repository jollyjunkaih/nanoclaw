import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runJxa } from './jxa.js';
import { getCalendarsScript } from './jxa/get-calendars.js';
import { getEventsScript } from './jxa/get-events.js';
import { createEventScript } from './jxa/create-event.js';
import { updateEventScript } from './jxa/update-event.js';
import { deleteEventScript } from './jxa/delete-event.js';
import { checkAvailabilityScript } from './jxa/check-availability.js';

const server = new McpServer({
  name: 'nanoclaw-calendar',
  version: '1.0.0',
});

server.registerTool(
  'get_calendars',
  {
    description: 'List all available calendars in Apple Calendar.',
    inputSchema: z.object({}),
  },
  async () => {
    const output = await runJxa(getCalendarsScript());
    return { content: [{ type: 'text', text: output }] };
  },
);

server.registerTool(
  'get_events',
  {
    description: 'Get events from Apple Calendar for a given date range.',
    inputSchema: z.object({
      date: z.string().describe('Start date in ISO format (e.g. 2024-01-15)'),
      endDate: z.string().optional().describe('End date in ISO format. Defaults to same as date.'),
      calendarName: z.string().optional().describe('Filter by calendar name. Omit to query all calendars.'),
    }),
  },
  async ({ date, endDate, calendarName }) => {
    const output = await runJxa(getEventsScript(date, endDate, calendarName));
    return { content: [{ type: 'text', text: output }] };
  },
);

server.registerTool(
  'create_event',
  {
    description: 'Create a new event in Apple Calendar.',
    inputSchema: z.object({
      title: z.string().describe('Event title'),
      start: z.string().describe('Start date/time in ISO format (e.g. 2024-01-15T10:00:00)'),
      end: z.string().describe('End date/time in ISO format (e.g. 2024-01-15T11:00:00)'),
      calendar: z.string().optional().describe('Calendar name. Defaults to the first calendar.'),
      location: z.string().optional().describe('Event location'),
      notes: z.string().optional().describe('Event notes'),
    }),
  },
  async ({ title, start, end, calendar, location, notes }) => {
    const output = await runJxa(createEventScript(title, start, end, calendar, location, notes));
    return { content: [{ type: 'text', text: output }] };
  },
);

server.registerTool(
  'update_event',
  {
    description: 'Update an existing event in Apple Calendar by event ID (UID).',
    inputSchema: z.object({
      eventId: z.string().describe('The event UID to update'),
      title: z.string().optional().describe('New title'),
      start: z.string().optional().describe('New start date/time in ISO format'),
      end: z.string().optional().describe('New end date/time in ISO format'),
      location: z.string().optional().describe('New location'),
      notes: z.string().optional().describe('New notes'),
    }),
  },
  async ({ eventId, title, start, end, location, notes }) => {
    const output = await runJxa(updateEventScript(eventId, title, start, end, location, notes));
    return { content: [{ type: 'text', text: output }] };
  },
);

server.registerTool(
  'delete_event',
  {
    description: 'Delete an event from Apple Calendar by event ID (UID).',
    inputSchema: z.object({
      eventId: z.string().describe('The event UID to delete'),
    }),
  },
  async ({ eventId }) => {
    const output = await runJxa(deleteEventScript(eventId));
    return { content: [{ type: 'text', text: output }] };
  },
);

server.registerTool(
  'check_availability',
  {
    description: 'Check free time slots in Apple Calendar for a given day.',
    inputSchema: z.object({
      date: z.string().describe('Date to check in ISO format (e.g. 2024-01-15)'),
      startTime: z.string().optional().describe('Start of working hours (HH:MM). Defaults to 09:00.'),
      endTime: z.string().optional().describe('End of working hours (HH:MM). Defaults to 17:00.'),
    }),
  },
  async ({ date, startTime, endTime }) => {
    const output = await runJxa(checkAvailabilityScript(date, startTime, endTime));
    return { content: [{ type: 'text', text: output }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
