import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { OpenAiChatModelService } from '../open-ai-chat-model/open-ai-chat-model.service';
import {
  AI_AGENT_CONFIG,
  AiAgentConfig,
  AiAgentRunOptions,
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

  async runAgentLoop(
    goal: string,
    options?: AiAgentRunOptions,
  ): Promise<{ goal: string; steps: AiAgentStep[]; final: unknown }> {
    await this.initializeMcpServers();

    const steps: AiAgentStep[] = [];
    const tools = await this.buildChatModelTools();
    const filteredTools = this.filterTools(tools, options?.allowedTools, options?.blockedTools);
    const hasTools = filteredTools.length > 0;
    const toolsPayload = hasTools ? filteredTools : undefined;
    steps.push({ action: 'list-tools', result: tools });

    let previousResponseId: string | undefined;
    let finalText: string | undefined;
    const systemPrompt = options?.systemPrompt ?? this.config.systemPrompt;
    const continuePrompt = options?.continuePrompt ?? this.config.continuePrompt;
    const computedNotesTemplate = options?.computedNotesTemplate ?? this.config.computedNotesTemplate;
    const maxModelCalls = options?.maxModelCalls ?? this.config.maxModelCalls;
    const enforceToolUse = options?.enforceToolUse ?? false;
    const toolUsePrompt = options?.toolUsePrompt;

    if (!systemPrompt) {
      throw new Error('AI_AGENT_SYSTEM_PROMPT is not set');
    }
    if (!continuePrompt) {
      throw new Error('AI_AGENT_CONTINUE_PROMPT is not set');
    }
    if (!computedNotesTemplate) {
      throw new Error('AI_AGENT_COMPUTED_NOTES_TEMPLATE is not set');
    }
    if (!maxModelCalls) {
      throw new Error('AI_AGENT_MAX_CALLS is not set');
    }
    if (enforceToolUse && !toolUsePrompt) {
      throw new Error('AI_AGENT_TOOL_USE_PROMPT is not set');
    }

    let remainingCalls = maxModelCalls;
    let forceToolUse = enforceToolUse;
    let enforcementRetries = 0;
    const maxEnforcementRetries = options?.maxToolEnforcementRetries ?? 3;
    const computedNotes: string[] = [];
    const toolNames = tools
      .map((tool) => (tool && typeof tool === 'object' ? (tool as { name?: string }).name : undefined))
      .filter((name): name is string => typeof name === 'string');
    const toolListText = toolNames.length > 0 ? toolNames.join(', ') : 'no tools available';
    const defaultToolChoice = options?.toolChoice;
    const toolChoiceFor = (required: boolean): 'required' | 'auto' | undefined => {
      if (!toolsPayload) {
        return undefined;
      }
      return required ? 'required' : defaultToolChoice;
    };
    const allowedNumbers = options?.enforceNumbersFromGoal ? new Set(this.extractNumbers(goal)) : undefined;
    const maxInvalidToolArgs = options?.maxInvalidToolArgs ?? 5;
    let invalidToolArgs = 0;

    while (remainingCalls > 0) {
      const allowedListText = allowedNumbers ? [...allowedNumbers].join(', ') : 'not enforced';
      const userText = forceToolUse
        ? toolUsePrompt
            .replace('{goal}', goal)
            .replace('{tools}', toolListText)
            .replace('{allowed}', allowedListText)
        : previousResponseId
          ? continuePrompt
          : goal;

      let response = await this.chatModel.createResponse({
        input: [
          {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: userText }],
          },
        ],
        ...(toolsPayload ? { tools: toolsPayload } : {}),
        ...(toolChoiceFor(forceToolUse) ? { tool_choice: toolChoiceFor(forceToolUse) } : {}),
        previous_response_id: previousResponseId,
        instructions: systemPrompt,
      });
      remainingCalls -= 1;
      previousResponseId = response.id;

      let toolCalls = this.chatModel.extractToolCalls(response);
      if (toolCalls.length === 0) {
        finalText = response.output_text ?? this.chatModel.extractOutputText(response.output);
        if (options?.enforceToolUse && hasTools) {
          enforcementRetries += 1;
          if (enforcementRetries > maxEnforcementRetries) {
            finalText =
              finalText ??
              `Tool enforcement failed after ${maxEnforcementRetries} retries. Check tool configuration.`;
            break;
          }
          forceToolUse = true;
          continue;
        }
        break;
      }
      forceToolUse = false;

      while (toolCalls.length > 0 && remainingCalls > 0) {
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

          if (allowedNumbers && !this.areToolArgsAllowed(args, allowedNumbers)) {
            const errorMessage = 'Tool args must use numbers from the goal or prior tool results.';
            steps.push({ action: 'call-tool', tool: call.name, args, error: errorMessage });
            toolOutputs.push({
              type: 'function_call_output',
              call_id: call.call_id,
              output: JSON.stringify({ error: errorMessage }),
            });
            invalidToolArgs += 1;
            if (invalidToolArgs >= maxInvalidToolArgs) {
              finalText = `Too many invalid tool arguments (${maxInvalidToolArgs}). Check prompt/tool usage.`;
              toolCalls = [];
              break;
            }
            continue;
          }

          const toolResult = await this.callTool(call.name, args);
          steps.push({ action: 'call-tool', tool: call.name, args, result: toolResult });
          computedNotes.push(this.formatToolNote(call.name, args, toolResult));
          this.trackToolResultNumber(toolResult, allowedNumbers);

          toolOutputs.push({
            type: 'function_call_output',
            call_id: call.call_id,
            output: JSON.stringify(toolResult),
          });
        }

        response = await this.chatModel.createResponse({
          input: [
            ...toolOutputs,
            {
              type: 'message',
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: computedNotesTemplate
                    .replace('{notes}', computedNotes.join('\n'))
                    .replace('{goal}', goal)
                    .replace('{allowed}', allowedListText),
                },
              ],
            },
          ],
          ...(toolsPayload ? { tools: toolsPayload } : {}),
          previous_response_id: previousResponseId,
          ...(toolChoiceFor(false) ? { tool_choice: toolChoiceFor(false) } : {}),
          instructions: systemPrompt,
        });
        remainingCalls -= 1;
        previousResponseId = response.id;

        toolCalls = this.chatModel.extractToolCalls(response);
        if (toolCalls.length === 0) {
          finalText = response.output_text ?? this.chatModel.extractOutputText(response.output);
          break;
        }
      }

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
        //const parameters = this.ensureObjectSchema(tool.inputSchema);
        const name = tool.name as string;
 
const parametersForModel = this.ensureObjectSchema(tool.inputSchema);
 
 
return {
  type: 'function',
  name,
  description: tool.description as string | undefined,
  parameters: parametersForModel,
  strict: false, // ✅ IMPORTANT (fixes “required must include all keys” OpenAI errors)
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
    const display = this.truncateNote(resultText ?? JSON.stringify(result));
    return `${name}(${argsText}) => ${display}`;
  }

  private truncateNote(value: string, maxChars = 2000): string {
    if (value.length <= maxChars) return value;
    return `${value.slice(0, maxChars)}…(truncated)`;
  }

  private extractTextFromToolResult(result: unknown): string | undefined {
    if (!result || typeof result !== 'object') {
      return undefined;
    }
    const content = (result as { content?: Array<{ text?: string }> }).content;
    return content?.[0]?.text;
  }

  private filterTools(
    tools: unknown[],
    allowedTools?: string[],
    blockedTools?: string[],
  ): Array<Record<string, unknown>> {
    const allowedSet = allowedTools ? new Set(allowedTools) : undefined;
    const blockedSet = blockedTools ? new Set(blockedTools) : undefined;
    return tools.filter((tool) => {
      if (!tool || typeof tool !== 'object') {
        return false;
      }
      const name = (tool as { name?: string }).name;
      if (typeof name !== 'string') {
        return false;
      }
      if (blockedSet?.has(name)) {
        return false;
      }
      if (allowedSet) {
        return allowedSet.has(name);
      }
      return true;
    }) as Array<Record<string, unknown>>;
  }


  private extractNumbers(text: string): number[] {
    const matches = text.match(/-?\d+(?:\.\d+)?/g) ?? [];
    return matches.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  }

  private extractNumbersFromArgs(args: Record<string, unknown>): number[] {
    const values: number[] = [];
    for (const value of Object.values(args)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        values.push(value);
      } else if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          values.push(parsed);
        }
      }
    }
    return values;
  }

  private areToolArgsAllowed(args: Record<string, unknown>, allowed?: Set<number>): boolean {
    if (!allowed) {
      return true;
    }
    const numbers = this.extractNumbersFromArgs(args);
    if (numbers.length === 0) {
      return true;
    }
    return numbers.every((value) => allowed.has(value));
  }

  private trackToolResultNumber(result: unknown, allowed?: Set<number>): void {
    if (!allowed) {
      return;
    }
    const text = this.extractTextFromToolResult(result);
    if (!text) {
      return;
    }
    const parsed = Number(text);
    if (Number.isFinite(parsed)) {
      allowed.add(parsed);
    }
  }

}
