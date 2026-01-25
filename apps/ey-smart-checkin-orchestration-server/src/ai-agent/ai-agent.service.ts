import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { OpenAiChatModelService } from '../open-ai-chat-model/open-ai-chat-model.service';
import {
  AI_AGENT_CONFIG,
  AiAgentConfig,
  AiAgentStep,
  McpServerConfig,
} from './ai-agent.types';

type ToolRouting = {
  serverKey: string;
  toolName: string;
};

export const resolveMcpServers = (configService: ConfigService): McpServerConfig[] => {
  const logger = new Logger('AiAgentConfig');
  const list = configService.get<string>('MCP_SERVER_URLS');
  if (list) {
    try {
      const parsed = JSON.parse(list) as Array<Partial<McpServerConfig>>;
      const servers = parsed
        .filter((item) => typeof item?.url === 'string')
        .map((item, index) => ({
          url: item.url as string,
          name: item.name ?? `mcp-${index + 1}`,
          toolNamePrefix: item.toolNamePrefix,
          clientName: item.clientName,
          clientVersion: item.clientVersion,
        }));
      if (servers.length > 0) {
        logger.log(`Resolved MCP servers from MCP_SERVER_URLS: ${servers.map((s) => s.url).join(', ')}`);
        return servers;
      }
    } catch {
      const servers = list
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((url, index) => ({
          url,
          name: `mcp-${index + 1}`,
        }));
      if (servers.length > 0) {
        logger.log(`Resolved MCP servers from MCP_SERVER_URLS: ${servers.map((s) => s.url).join(', ')}`);
        return servers;
      }
    }
  }

  const single = configService.get<string>('MCP_SERVER_URL');
  if (single) {
    logger.log(`Resolved MCP server from MCP_SERVER_URL: ${single}`);
    return [{ url: single, name: 'mcp-default' }];
  }

  logger.warn('No MCP servers resolved from MCP_SERVER_URLS or MCP_SERVER_URL.');
  return [];
};

@Injectable()
export class AiAgentService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiAgentService.name);
  private readonly clients = new Map<string, Client>();
  private readonly transports = new Map<string, StreamableHTTPClientTransport>();
  private readonly toolRouting = new Map<string, ToolRouting>();
  private initialized = false;
  private initializing?: Promise<void>;

  constructor(
    @Inject(AI_AGENT_CONFIG) private readonly config: AiAgentConfig,
    private readonly chatModel: OpenAiChatModelService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.initializeMcpServers();
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.transports.values()].map((transport) => transport.close()));
  }

  async listTools(): Promise<{ tools: Array<Record<string, unknown>> }> {
    await this.initializeMcpServers();

    this.toolRouting.clear();
    const tools: Array<Record<string, unknown>> = [];

    for (const server of this.config.mcpServers) {
      const serverKey = this.resolveServerKey(server);
      const client = this.clients.get(serverKey);
      if (!client) {
        continue;
      }

      const result = await client.listTools();
      const serverTools = (result as { tools?: Array<Record<string, unknown>> }).tools ?? [];
      for (const tool of serverTools) {
        if (typeof tool?.name !== 'string') {
          continue;
        }
        const routedName = this.resolveToolName(server, tool.name);
        if (!routedName) {
          continue;
        }
        this.toolRouting.set(routedName, { serverKey, toolName: tool.name });
        tools.push({ ...tool, name: routedName });
      }
    }

    return { tools };
  }

  async runAgentLoop(goal: string): Promise<{ goal: string; steps: AiAgentStep[]; final: unknown }> {
    await this.initializeMcpServers();

    const steps: AiAgentStep[] = [];
    const tools = await this.buildChatModelTools();
    steps.push({ action: 'list-tools', result: tools });

    let previousResponseId: string | undefined;
    let finalText: string | undefined;
    let remainingCalls = this.config.maxModelCalls ?? 8;
    const computedNotes: string[] = [];

    while (remainingCalls > 0) {
      const userText = previousResponseId ? this.config.continuePrompt ?? 'Continue. Use tools if needed.' : goal;

      const response = await this.chatModel.createResponse({
        input: [
          {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: userText }],
          },
        ],
        tools,
        previous_response_id: previousResponseId,
        instructions:
          this.config.systemPrompt ?? 'You are an orchestration agent.',
      });
      remainingCalls -= 1;
      previousResponseId = response.id;

      const toolCalls = this.chatModel.extractToolCalls(response);
      if (toolCalls.length === 0) {
        finalText = response.output_text ?? this.chatModel.extractOutputText(response.output);
        break;
      }

      const toolOutputs = [];
      for (const call of toolCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(call.arguments ?? '{}');
        } catch (error) {
          steps.push({
            action: 'tool-args-parse-failed',
            tool: call.name,
            error: error instanceof Error ? error.message : String(error),
          });
        }

        const toolResult = await this.callTool(call.name, args);
        steps.push({ action: 'call-tool', tool: call.name, args, result: toolResult });
        computedNotes.push(this.formatToolNote(call.name, args, toolResult));

        toolOutputs.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: JSON.stringify(toolResult),
        });
      }

      if (remainingCalls <= 0) {
        break;
      }

      const followup = await this.chatModel.createResponse({
        input: [
          ...toolOutputs,
          {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text:
                  this.config.computedNotesTemplate?.replace('{notes}', computedNotes.join('\n')) ??
                  `Computed results so far:\n${computedNotes.join('\n')}\nUse these results. If the goal is fully solved, provide the final answer only. Do not recompute steps.`,
              },
            ],
          },
        ],
        previous_response_id: previousResponseId,
        instructions:
          this.config.systemPrompt ?? 'You are an orchestration agent.',
      });
      remainingCalls -= 1;
      previousResponseId = followup.id;

      const followupToolCalls = this.chatModel.extractToolCalls(followup);
      if (followupToolCalls.length > 0) {
        continue;
      }

      finalText = followup.output_text ?? this.chatModel.extractOutputText(followup.output);
      if (finalText) {
        break;
      }
    }

    return {
      goal,
      steps,
      final: finalText ?? { message: 'No final answer returned by model.' },
    };
  }

  async buildChatModelTools(): Promise<unknown[]> {
    const result = await this.listTools();
    const tools = (result as { tools?: Array<Record<string, unknown>> }).tools ?? [];

    return tools
      .filter((tool) => typeof tool?.name === 'string')
      .map((tool) => {
        const parameters = this.ensureObjectSchema(tool.inputSchema);
        return {
          type: 'function',
          name: tool.name as string,
          description: tool.description as string | undefined,
          parameters,
          strict: true,
        };
      });
  }

  hasTool(name: string): boolean {
    return this.toolRouting.has(name);
  }

  async initializeMcpServers(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.initializing) {
      await this.initializing;
      return;
    }

    this.initializing = this.connectMcpServers();
    await this.initializing;
    this.initializing = undefined;
  }

  private async connectMcpServers(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.config.mcpServers.length === 0) {
      this.logger.warn('No MCP servers configured.');
      this.initialized = true;
      return;
    }

    this.logger.log(
      `Initializing MCP servers: ${this.config.mcpServers.map((server) => server.url).join(', ')}`,
    );

    for (const server of this.config.mcpServers) {
      const serverKey = this.resolveServerKey(server);
      const transport = new StreamableHTTPClientTransport(new URL(server.url));
      const client = new Client({
        name: server.clientName ?? this.config.defaultClientName ?? 'ai-agent',
        version: server.clientVersion ?? this.config.defaultClientVersion ?? '1.0.0',
      });

      await client.connect(transport);
      this.transports.set(serverKey, transport);
      this.clients.set(serverKey, client);
      this.logger.log(`Connected to MCP server at ${server.url}`);
    }

    this.initialized = true;
  }

  private resolveServerKey(server: McpServerConfig): string {
    return server.name ?? server.url;
  }

  private resolveToolName(server: McpServerConfig, toolName: string): string | undefined {
    const baseName = server.toolNamePrefix ? `${server.toolNamePrefix}${toolName}` : toolName;
    if (!this.toolRouting.has(baseName)) {
      return baseName;
    }

    const strategy = this.config.toolCollisionStrategy ?? 'namespace';
    if (strategy === 'skip') {
      this.logger.warn(`Tool name collision for ${baseName}; skipping duplicate.`);
      return undefined;
    }
    if (strategy === 'error') {
      throw new Error(`Tool name collision for ${baseName}`);
    }

    const separator = this.config.toolNamespaceSeparator ?? '::';
    const namespace = this.resolveToolNamespace(server);
    const namespaced = `${namespace}${separator}${baseName}`;
    if (this.toolRouting.has(namespaced)) {
      throw new Error(`Tool name collision for ${namespaced}`);
    }
    return namespaced;
  }

  private resolveToolNamespace(server: McpServerConfig): string {
    const key = this.config.toolNamespaceKey ?? 'name';
    if (key === 'url') {
      return server.url;
    }
    return server.name ?? server.url;
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.initializeMcpServers();
    const route = this.toolRouting.get(name);
    if (!route) {
      throw new Error(`Tool not found: ${name}`);
    }
    const client = this.clients.get(route.serverKey);
    if (!client) {
      throw new Error(`MCP client unavailable for server ${route.serverKey}`);
    }
    return client.callTool({ name: route.toolName, arguments: args });
  }

  private ensureObjectSchema(schema: unknown): Record<string, unknown> {
    if (!schema || typeof schema !== 'object') {
      return { type: 'object', properties: {}, additionalProperties: false };
    }
    const typed = schema as Record<string, unknown>;
    const withType = typed.type ? typed : { ...typed, type: 'object' };
    if (!withType.properties) {
      (withType as Record<string, unknown>).properties = {};
    }
    if (withType.additionalProperties === undefined) {
      (withType as Record<string, unknown>).additionalProperties = false;
    }
    return withType;
  }

  private formatToolNote(name: string, args: Record<string, unknown>, result: unknown): string {
    const argsText = JSON.stringify(args);
    const resultText = this.extractTextFromToolResult(result);
    const display = resultText ?? JSON.stringify(result);
    return `${name}(${argsText}) => ${display}`;
  }

  private extractTextFromToolResult(result: unknown): string | undefined {
    if (!result || typeof result !== 'object') {
      return undefined;
    }
    const content = (result as { content?: Array<{ text?: string }> }).content;
    return content?.[0]?.text;
  }

}
