import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { tripIdentificationMcpTool } from '../tools/trip-identification.tool';
import { TripIdentificationService } from './trip-identification.service';

type McpSession = {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
};

@Injectable()
export class TripIdentificationToolsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TripIdentificationToolsService.name);
  private readonly sessions = new Map<string, McpSession>();

  constructor(private readonly tripIdentification: TripIdentificationService) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('MCP server started (streamable HTTP). Endpoint: /mcp-check-in/v1/trip-identification');
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
      name: 'nest-mcp-trip-identification',
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
    server.registerTool(
      tripIdentificationMcpTool.name,
      tripIdentificationMcpTool.definition,
      tripIdentificationMcpTool.handler(this.tripIdentification),
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
