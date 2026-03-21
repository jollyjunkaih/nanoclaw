import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
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
  structured: {
    command: 'node',
    args: [path.join(serversDir, 'structured', 'dist', 'index.js')],
    cwd: path.join(serversDir, 'structured'),
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

const app = express();
app.use(express.json());

// Health endpoint
app.get('/health', (_req: Request, res: Response) => {
  const backends = Object.keys(BACKENDS);
  const connected = Array.from(clients.keys());
  res.json({ status: 'ok', backends, connected });
});

// Per-backend MCP proxy endpoints
for (const name of Object.keys(BACKENDS)) {
  app.post(`/${name}/mcp`, async (req: Request, res: Response) => {
    const { method, params, id, jsonrpc } = req.body;

    const jsonRpcResponse = (result: unknown) => ({
      jsonrpc: jsonrpc || '2.0',
      id: id ?? null,
      result,
    });

    const jsonRpcError = (code: number, message: string) => ({
      jsonrpc: jsonrpc || '2.0',
      id: id ?? null,
      error: { code, message },
    });

    try {
      // Handle initialize locally — no need to forward
      if (method === 'initialize') {
        res.json(jsonRpcResponse({
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: {
            name: `gateway-${name}`,
            version: '1.0.0',
          },
        }));
        return;
      }

      const client = await getOrSpawnClient(name);

      if (method === 'tools/list') {
        const result = await client.listTools();
        res.json(jsonRpcResponse(result));
        return;
      }

      if (method === 'tools/call') {
        const { name: toolName, arguments: toolArgs } = params || {};
        const result = await client.callTool({ name: toolName, arguments: toolArgs });
        res.json(jsonRpcResponse(result));
        return;
      }

      // Unsupported method
      res.status(400).json(jsonRpcError(-32601, `Method not supported: ${method}`));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[gateway] Error proxying ${method} to ${name}:`, message);
      // Delete client so it respawns on next request
      clients.delete(name);
      res.status(500).json(jsonRpcError(-32603, message));
    }
  });
}

app.listen(GATEWAY_PORT, '127.0.0.1', () => {
  console.log(`[gateway] MCP Gateway listening on 127.0.0.1:${GATEWAY_PORT}`);
  console.log(`[gateway] Backends: ${Object.keys(BACKENDS).join(', ')}`);
});
