// apps/ey-smart-checkin-mcp-server/src/mcp-checkin/validate-processcheckin/services/validate-process-checkin.tools-service.ts
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import { ValidateProcessCheckinService } from './ssci-process-checkin.service';
import { ssciValidateProcessCheckinMcpTool } from '../tools/validate-process-checkin.tools';

type McpSession = { server: McpServer; transport: StreamableHTTPServerTransport };

@Injectable()
export class ValidateProcessCheckInToolsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ValidateProcessCheckInToolsService.name);
  private readonly sessions = new Map<string, McpSession>();

  constructor(private readonly validateSvc: ValidateProcessCheckinService) {}

  async onModuleInit(): Promise<void> {
    this.logger.log(
      'MCP validate-processcheckin started. Endpoint: /mcp-check-in/v1/validate-processcheckin',
    );
  }

  async onModuleDestroy(): Promise<void> {
    const transports = Array.from(this.sessions.values()).map((s) => s.transport);
    await Promise.all(transports.map((t) => t.close()));
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
    const server = new McpServer({ name: 'nest-mcp-ssci', version: '1.0.0' });

    server.registerTool(
      ssciValidateProcessCheckinMcpTool.name,
      ssciValidateProcessCheckinMcpTool.definition,
      ssciValidateProcessCheckinMcpTool.handler(this.validateSvc),
    );

    const session: McpSession = {
      server,
      transport: new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          this.sessions.set(sid, session);
          this.logger.log(`MCP session initialized: ${sid}`);
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

  private getSessionId(req: Request): string | undefined {
    const header = req.headers['mcp-session-id'];
    return Array.isArray(header) ? header[0] : header;
  }

  private isInitializeRequest(body?: unknown): boolean {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
    return (body as any).method === 'initialize';
  }
}
