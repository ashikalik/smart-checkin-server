import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

type McpSession = {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
};

@Injectable()
export class BeginConversationToolsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BeginConversationToolsService.name);
  private readonly sessions = new Map<string, McpSession>();

  async onModuleInit(): Promise<void> {
    this.logger.log('MCP server started (streamable HTTP). Endpoint: /mcp-check-in/v1/begin-conversation');
  }

  async onModuleDestroy(): Promise<void> {
    const transports = Array.from(this.sessions.values()).map((session) => session.transport);
    await Promise.all(transports.map((transport) => transport.close()));
  }

  async handleRequest(req: Request, res: Response, body?: unknown): Promise<void> {
    const sessionId = this.getSessionId(req);
    if (sessionId && this.sessions.has(sessionId)) {
      await this.sessions.get(sessionId)!.transport.handleRequest(req, res, body);
      return;
    }

    if (!sessionId && this.isInitializeRequest(body)) {
      const session = this.createSession();
      await session.server.connect(session.transport);
      await session.transport.handleRequest(req, res, body);
      return;
    }

    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: sessionId
          ? 'Bad Request: Unknown MCP session. Reinitialize.'
          : 'Bad Request: Missing MCP session. Send initialize request first.',
      },
      id: null,
    });
  }

  private createSession(): McpSession {
    const server = new McpServer({
      name: 'nest-mcp-begin-conversation',
      version: '1.0.0',
    });
    this.registerTools(server);

    const session: McpSession = {
      server,
      transport: new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          this.sessions.set(sessionId, session);
          this.logger.log(`MCP session initialized: ${sessionId}`);
        },
      }),
    };

    session.transport.onclose = () => {
      const sid = session.transport.sessionId;
      if (sid && this.sessions.has(sid)) {
        this.sessions.delete(sid);
        this.logger.log(`MCP session closed: ${sid}`);
      }
    };

    return session;
  }

  private registerTools(server: McpServer): void {
    const schema = z.object({});
    server.registerTool(
      'begin_conversation_ping',
      {
        description: 'No-op tool to validate MCP connectivity for begin conversation.',
        inputSchema: schema,
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
      async () => ({
        content: [{ type: 'text', text: JSON.stringify({ ok: true }) }],
      }),
    );
  }

  private getSessionId(req: Request): string | undefined {
    const header = req.headers['mcp-session-id'];
    if (Array.isArray(header)) {
      return header[0];
    }
    return header;
  }

  private isInitializeRequest(body?: unknown): boolean {
    if (!body || typeof body !== 'object') {
      return false;
    }
    const payload = body as { method?: string };
    return payload.method === 'initialize';
  }
}
