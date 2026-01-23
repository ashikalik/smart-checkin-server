import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';

import { PercentSchema, TwoNumberSchema } from './schemas/math.schema';
import { SaveResultSchema } from './schemas/save-result.schema';
import { MathService } from './services/math.service';
import { SaveResultService } from './services/save-result.service';

type ToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

type McpSession = {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
};

@Injectable()
export class McpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(McpService.name);
  private readonly sessions = new Map<string, McpSession>();

  constructor(
    private readonly math: MathService,
    private readonly saver: SaveResultService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('MCP server started (streamable HTTP). Endpoint: /mcp');
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
      name: 'nest-mcp-math',
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
    // ---- Math tools ----
    server.registerTool(
      'add',
      {
        description: 'Add two numbers',
        inputSchema: TwoNumberSchema,
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
      async ({ a, b }) => this.respond(this.math.add(a, b)),
    );

    server.registerTool(
      'subtract',
      {
        description: 'Subtract two numbers',
        inputSchema: TwoNumberSchema,
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
      async ({ a, b }) => this.respond(this.math.subtract(a, b)),
    );

    server.registerTool(
      'multiply',
      {
        description: 'Multiply two numbers',
        inputSchema: TwoNumberSchema,
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
      async ({ a, b }) => this.respond(this.math.multiply(a, b)),
    );

    server.registerTool(
      'divide',
      {
        description: 'Divide two numbers',
        inputSchema: TwoNumberSchema,
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
      async ({ a, b }) => {
        try {
          return this.respond(this.math.divide(a, b));
        } catch (e: any) {
          return this.respondError(e?.message ?? 'Divide failed');
        }
      },
    );

    server.registerTool(
      'percent',
      {
        description: 'Calculate percent of a value (percent/100 * value)',
        inputSchema: PercentSchema,
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
      async ({ percent, value }) => this.respond(this.math.percentOf(percent, value)),
    );

    // ---- Save Result tool (POST) ----
    server.registerTool(
      'save_result',
      {
        description: 'Save a calculation result via POST API',
        inputSchema: SaveResultSchema,
        annotations: { readOnlyHint: false, idempotentHint: false },
      },
      async ({ operation, result }) => {
        try {
          const apiRes = await this.saver.save(operation, result);
          return this.respond(apiRes);
        } catch (e: any) {
          return this.respondError(e?.message ?? 'save_result failed');
        }
      },
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
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return false;
    }
    const method = (body as { method?: string }).method;
    return method === 'initialize';
  }

  private respond(data: unknown): ToolResponse {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  private respondError(message: string): ToolResponse {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: message,
        },
      ],
    };
  }
}
