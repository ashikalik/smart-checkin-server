import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { AzureOpenAiChatModelService } from '../azure-open-ai-chat-model/azure-open-ai-chat-model.service';
import { IdentificationOrchestratorService } from '../identification-orchestrator/identification-orchestrator.service';
import { FfpBookingOrchestratorService } from '../ffp-booking-orchestrator/ffp-booking-orchestrator.service';
import { ArithmeticOrchestratorService } from '../arithmetic-orchestrator/arithmetic-orchestrator.service';

type ToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

const SelectBookingSchema = z.object({
  utterance: z.string().min(1),
  choices: z.array(
    z.object({
      id: z.string().min(1),
      summary: z.string().optional(),
    }),
  ),
});

const IdentificationSchema = z.object({
  pnr: z.string().min(1),
  lastName: z.string().min(1),
});

const FfpBookingSchema = z.object({
  frequentFlyerCardNumber: z.string().min(1),
  lastName: z.string().min(1),
});

const ArithmeticSchema = z.object({
  goal: z.string().min(1),
});

@Injectable()
export class MainMcpService implements OnModuleDestroy {
  private readonly logger = new Logger(MainMcpService.name);
  private server?: McpServer;
  private transport?: StdioServerTransport;

  constructor(
    private readonly configService: ConfigService,
    private readonly chatModel: AzureOpenAiChatModelService,
    private readonly identification: IdentificationOrchestratorService,
    private readonly ffpBooking: FfpBookingOrchestratorService,
    private readonly arithmetic: ArithmeticOrchestratorService,
  ) {}

  async start(): Promise<void> {
    if (this.server) {
      return;
    }

    const server = new McpServer({
      name: 'main-mcp',
      version: '1.0.0',
    });

    this.registerTools(server);

    const transport = new StdioServerTransport();
    await server.connect(transport);

    this.server = server;
    this.transport = transport;
    this.logger.log('Main MCP server started (stdio).');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = undefined;
    }
  }

  private registerTools(server: McpServer): void {
    server.registerTool(
      'select_booking',
      {
        description: 'Resolve a booking choice from a user utterance and a list of choices.',
        inputSchema: SelectBookingSchema,
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
      async ({ utterance, choices }) => {
        try {
          const systemPrompt = this.getRequiredEnv('MAIN_ORCHESTRATOR_CHOICE_SYSTEM_PROMPT');
          let userPrompt = this.getRequiredEnv('MAIN_ORCHESTRATOR_CHOICE_USER_PROMPT');
          userPrompt = userPrompt.replace('{goal}', utterance).replace('{choices}', JSON.stringify(choices));
          const response = await this.chatModel.createResponse({
            instructions: systemPrompt,
            input: [
              {
                type: 'message',
                role: 'user',
                content: [{ type: 'input_text', text: userPrompt }],
              },
            ],
          });
          const output = response.output_text ?? this.chatModel.extractOutputText(response.output) ?? '';
          const bookingId = this.extractIdOrNone(output, choices.map((choice) => choice.id));
          return this.respond({ bookingId });
        } catch (error) {
          return this.respondError(error instanceof Error ? error.message : String(error));
        }
      },
    );

    server.registerTool(
      'orchestrator_identification',
      {
        description: 'Run the identification orchestrator with a PNR and last name.',
        inputSchema: IdentificationSchema,
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
      async ({ pnr, lastName }) => {
        try {
          const result = await this.identification.runAgentLoop(`pnr ${pnr} lastName ${lastName}`);
          return this.respond(this.extractFinal(result.final));
        } catch (error) {
          return this.respondError(error instanceof Error ? error.message : String(error));
        }
      },
    );

    server.registerTool(
      'orchestrator_ffp_booking',
      {
        description: 'Run the FFP booking orchestrator with frequent flyer number and last name.',
        inputSchema: FfpBookingSchema,
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
      async ({ frequentFlyerCardNumber, lastName }) => {
        try {
          const result = await this.ffpBooking.runAgentLoop(
            `frequentFlyerCardNumber ${frequentFlyerCardNumber} lastName ${lastName}`,
          );
          return this.respond(this.extractFinal(result.final));
        } catch (error) {
          return this.respondError(error instanceof Error ? error.message : String(error));
        }
      },
    );

    server.registerTool(
      'orchestrator_arithmetic',
      {
        description: 'Run the arithmetic orchestrator for a math goal.',
        inputSchema: ArithmeticSchema,
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
      async ({ goal }) => {
        try {
          const result = await this.arithmetic.runAgentLoop(goal);
          return this.respond(this.extractFinal(result.final));
        } catch (error) {
          return this.respondError(error instanceof Error ? error.message : String(error));
        }
      },
    );
  }

  private extractFinal(final: unknown): Record<string, unknown> {
    if (!final) {
      return { error: 'No final answer returned by orchestrator.' };
    }
    if (typeof final === 'object') {
      return final as Record<string, unknown>;
    }
    if (typeof final === 'string') {
      try {
        return JSON.parse(final) as Record<string, unknown>;
      } catch {
        return { error: final };
      }
    }
    return { error: String(final) };
  }

  private extractIdOrNone(output: string, allowed: string[]): string | null {
    const trimmed = output.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.toLowerCase() === 'none') {
      return null;
    }
    const match = trimmed.match(/[A-Z0-9]{5,8}/);
    if (!match) {
      return null;
    }
    const id = match[0];
    return allowed.includes(id) ? id : null;
  }

  private getRequiredEnv(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new Error(`${key} is not set`);
    }
    return value;
  }

  private respond(data: unknown): ToolResponse {
    return {
      content: [{ type: 'text', text: JSON.stringify(data) }],
    };
  }

  private respondError(message: string): ToolResponse {
    return {
      isError: true,
      content: [{ type: 'text', text: message }],
    };
  }
}
