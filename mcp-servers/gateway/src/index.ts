import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GATEWAY_PORT = parseInt(process.env.MCP_GATEWAY_PORT || '3002', 10);

interface BackendConfig {
  command: string;
  args: string[];
  cwd: string;
}

const serversDir = path.resolve(__dirname, '../../');
const BACKENDS: Record<string, BackendConfig> = {
  calendar: {
    command: 'node',
    args: [path.join(serversDir, 'calendar', 'dist', 'index.js')],
    cwd: path.join(serversDir, 'calendar'),
  },
  mail: {
    command: 'node',
    args: [path.join(serversDir, 'mail', 'dist', 'index.js')],
    cwd: path.join(serversDir, 'mail'),
  },
  timetracker: {
    command: 'node',
    args: [path.join(serversDir, 'timetracker', 'dist', 'mcp', 'index.js')],
    cwd: path.join(serversDir, 'timetracker'),
  },
};

// Lazy-spawned MCP clients to backends
const clients: Map<string, Client> = new Map();

async function getOrSpawnClient(name: string): Promise<Client> {
  const existing = clients.get(name);
  if (existing) return existing;

  const config = BACKENDS[name];
  if (!config) throw new Error(`Unknown backend: ${name}`);

  console.log(`[gateway] Spawning backend: ${name}`);
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args,
    cwd: config.cwd,
  });

  const client = new Client({ name: `gateway-${name}`, version: '1.0.0' });
  await client.connect(transport);

  // Auto-remove on close so it respawns on next request
  transport.onclose = () => {
    console.log(`[gateway] Backend ${name} closed, will respawn on next request`);
    clients.delete(name);
  };

  clients.set(name, client);
  return client;
}

/**
 * Creates a proxy Server for a backend that forwards tools/list and tools/call
 * to the backend client via StdioClientTransport.
 */
function createProxyServer(name: string): Server {
  const server = new Server(
    { name: `gateway-${name}`, version: '1.0.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const client = await getOrSpawnClient(name);
    return client.listTools();
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const client = await getOrSpawnClient(name);
    try {
      return await client.callTool({
        name: request.params.name,
        arguments: request.params.arguments,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[gateway] Error calling ${request.params.name} on ${name}:`, message);
      // Delete client so it respawns on next request
      clients.delete(name);
      return {
        content: [{ type: 'text' as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

const app = express();
app.use(express.json());

// Health endpoint
app.get('/health', (_req: Request, res: Response) => {
  const backends = Object.keys(BACKENDS);
  const connected = Array.from(clients.keys());
  res.json({ status: 'ok', backends, connected });
});

// Per-backend Streamable HTTP MCP endpoints.
// Each request gets a stateless transport; the Server handles the full
// MCP Streamable HTTP protocol (initialize, tools/list, tools/call).
for (const name of Object.keys(BACKENDS)) {
  const mcpRoute = `/${name}/mcp`;

  app.post(mcpRoute, async (req: Request, res: Response) => {
    try {
      // Each request gets its own Server + Transport pair to avoid
      // "Already connected to a transport" errors on concurrent requests.
      const perRequestServer = createProxyServer(name);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      await perRequestServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[gateway] Error handling ${name} request:`, message);
      clients.delete(name);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          id: req.body?.id ?? null,
          error: { code: -32603, message },
        });
      }
    }
  });

  // GET for SSE streams — not supported in stateless mode
  app.get(mcpRoute, (_req: Request, res: Response) => {
    res.status(405).set('Allow', 'POST').json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'SSE streams not supported in stateless mode' },
    });
  });

  // DELETE for session termination — not supported in stateless mode
  app.delete(mcpRoute, (_req: Request, res: Response) => {
    res.status(405).set('Allow', 'POST').json({
      jsonrpc: '2.0',
      error: { code: -32000, message: 'Session termination not supported in stateless mode' },
    });
  });
}

app.listen(GATEWAY_PORT, '127.0.0.1', () => {
  console.log(`[gateway] MCP Gateway listening on 127.0.0.1:${GATEWAY_PORT}`);
  console.log(`[gateway] Backends: ${Object.keys(BACKENDS).join(', ')}`);
});
