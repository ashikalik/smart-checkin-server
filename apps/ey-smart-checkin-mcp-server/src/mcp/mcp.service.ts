import { Injectable, Logger } from '@nestjs/common';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { TwoNumberSchema } from './schemas/math.schema';
import { SaveResultSchema } from './schemas/save-result.schema';
import { MathService } from './services/math.service';
import { SaveResultService } from './services/save-result.service';

type ToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  constructor(
    private readonly math: MathService,
    private readonly saver: SaveResultService,
  ) {}

  async start(): Promise<void> {
    const server = new McpServer({
      name: 'nest-mcp-math',
      version: '1.0.0',
    });

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

    await server.connect(new StdioServerTransport());
    this.logger.log('MCP server started (stdio). Tools: add/subtract/multiply/divide/save_result');
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
