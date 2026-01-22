import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';

import { TwoNumberSchema } from './schemas/math.schema';
import { SaveResultSchema } from './schemas/save-result.schema';
import { MathService } from './services/math.service';
import { SaveResultService } from './services/save-result.service';

type ToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

@Injectable()
export class McpService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(McpService.name);
  private readonly server: McpServer;
  private readonly transport: StreamableHTTPServerTransport;

  constructor(
    private readonly math: MathService,
    private readonly saver: SaveResultService,
  ) {
    this.server = new McpServer({
      name: 'nest-mcp-math',
      version: '1.0.0',
    });
    this.transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    this.registerTools();
  }

  async onModuleInit(): Promise<void> {
    await this.server.connect(this.transport);
    this.logger.log('MCP server started (streamable HTTP). Endpoint: /mcp');
  }

  async onModuleDestroy(): Promise<void> {
    await this.transport.close();
  }

  async handleRequest(req: Request, res: Response, body?: unknown): Promise<void> {
    await this.transport.handleRequest(req, res, body);
  }

  private registerTools(): void {
    const server = this.server;
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
