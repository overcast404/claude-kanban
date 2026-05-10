import { Router, Request, Response } from 'express';

export const mcpRouter = Router();

// Streamable HTTP MCP endpoint — Claude Code connects via POST
mcpRouter.post('/sse', (req: Request, res: Response) => {
  const { method, id, params } = req.body;
  console.log('[MCP] POST request:', method);

  if (method === 'tools/list') {
    return res.json({
      jsonrpc: '2.0', id,
      result: {
        tools: [{
          name: 'mark_complete',
          description: 'Mark the task as complete. Call this when you have finished all work.',
          inputSchema: {
            type: 'object',
            properties: {
              summary: { type: 'string', description: 'Summary of what was accomplished' },
            },
            required: ['summary'],
          },
        }],
      },
    });
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params;
    if (name === 'mark_complete') {
      return res.json({
        jsonrpc: '2.0', id,
        result: {
          content: [{ type: 'text', text: `Task marked as complete. Summary: ${args?.summary || 'No summary'}` }],
          isError: false,
        },
      });
    }
    return res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown tool: ${name}` } });
  }

  if (method === 'initialize') {
    return res.json({
      jsonrpc: '2.0', id,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'claude-kanban', version: '0.1.0' },
      },
    });
  }

  res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Unknown method: ${method}` } });
});

// Also support GET for health checks
mcpRouter.get('/sse', (_req: Request, res: Response) => {
  res.json({ status: 'ok', protocol: 'streamable-http' });
});
