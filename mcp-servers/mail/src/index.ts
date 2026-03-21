import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { runJxa } from './jxa.js';
import { getRecentScript } from './jxa/get-recent.js';
import { searchScript } from './jxa/search.js';
import { getEmailScript } from './jxa/get-email.js';
import { sendScript } from './jxa/send.js';
import { replyScript } from './jxa/reply.js';
import { getMailboxesScript } from './jxa/get-mailboxes.js';

const server = new McpServer({
  name: 'nanoclaw-mail',
  version: '1.0.0',
});

server.registerTool(
  'get_recent_emails',
  {
    description: 'Get recent emails from Apple Mail inbox or a specified mailbox.',
    inputSchema: z.object({
      limit: z.number().optional().describe('Max number of messages to return. Defaults to 20.'),
      mailbox: z.string().optional().describe('Mailbox name to read from. Defaults to inbox.'),
      unreadOnly: z.boolean().optional().describe('If true, return only unread messages.'),
    }),
  },
  async ({ limit, mailbox, unreadOnly }) => {
    const output = await runJxa(getRecentScript(limit, mailbox, unreadOnly));
    return { content: [{ type: 'text', text: output }] };
  },
);

server.registerTool(
  'search_emails',
  {
    description: 'Search Apple Mail messages by subject or sender.',
    inputSchema: z.object({
      query: z.string().describe('Search string to match against subject or sender.'),
      mailbox: z.string().optional().describe('Mailbox to search in. Defaults to inbox.'),
      limit: z.number().optional().describe('Max number of results. Defaults to 20.'),
    }),
  },
  async ({ query, mailbox, limit }) => {
    const output = await runJxa(searchScript(query, mailbox, limit));
    return { content: [{ type: 'text', text: output }] };
  },
);

server.registerTool(
  'get_email',
  {
    description: 'Get the full content of a specific email by its integer message ID.',
    inputSchema: z.object({
      emailId: z.number().describe('The integer message ID of the email to retrieve.'),
    }),
  },
  async ({ emailId }) => {
    const output = await runJxa(getEmailScript(emailId));
    return { content: [{ type: 'text', text: output }] };
  },
);

server.registerTool(
  'send_email',
  {
    description: 'Send a new email via Apple Mail.',
    inputSchema: z.object({
      to: z.string().describe('Recipient email address.'),
      subject: z.string().describe('Email subject.'),
      body: z.string().describe('Email body text.'),
      cc: z.string().optional().describe('CC email address.'),
      bcc: z.string().optional().describe('BCC email address.'),
    }),
  },
  async ({ to, subject, body, cc, bcc }) => {
    const output = await runJxa(sendScript(to, subject, body, cc, bcc));
    return { content: [{ type: 'text', text: output }] };
  },
);

server.registerTool(
  'reply_to_email',
  {
    description: 'Reply to an existing email in Apple Mail.',
    inputSchema: z.object({
      emailId: z.number().describe('The integer message ID of the email to reply to.'),
      body: z.string().describe('Reply body text.'),
      replyAll: z.boolean().optional().describe('If true, reply to all recipients. Defaults to false.'),
    }),
  },
  async ({ emailId, body, replyAll }) => {
    const output = await runJxa(replyScript(emailId, body, replyAll));
    return { content: [{ type: 'text', text: output }] };
  },
);

server.registerTool(
  'get_mailboxes',
  {
    description: 'List all mailboxes across all Apple Mail accounts.',
    inputSchema: z.object({}),
  },
  async () => {
    const output = await runJxa(getMailboxesScript());
    return { content: [{ type: 'text', text: output }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
