import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

type OrchestratorStep = {
  action: string;
  tool?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  error?: string;
};

type OpenAiResponse = {
  id: string;
  output?: Array<Record<string, unknown>>;
  output_text?: string;
};

type OpenAiToolCall = {
  type: 'function_call';
  name: string;
  arguments: string;
  call_id: string;
};

@Injectable()
export class OrchestratorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrchestratorService.name);
  private client?: Client;
  private transport?: StreamableHTTPClientTransport;
  private initialized = false;
  private initializing?: Promise<void>;

  async onModuleInit(): Promise<void> {
    await this.ensureConnected();
  }

  async onModuleDestroy(): Promise<void> {
    await this.transport?.close();
  }

  async listTools(): Promise<unknown> {
    await this.ensureConnected();
    return this.client.listTools();
  }

  async runLoop(goal: string): Promise<{ goal: string; steps: OrchestratorStep[]; final: unknown }> {
    await this.ensureConnected();

    const steps: OrchestratorStep[] = [];
    const toolsResult = await this.client.listTools();
    steps.push({ action: 'list-tools', result: toolsResult });

    const decision = this.decidePlan(goal);
    if (!decision) {
      return {
        goal,
        steps,
        final: { message: 'No matching tool plan. Try: add/subtract/multiply/divide/save result.' },
      };
    }

    const toolResult = await this.callTool(decision.tool, decision.args);
    steps.push({ action: 'call-tool', tool: decision.tool, args: decision.args, result: toolResult });

    if (decision.saveResult && typeof decision.operation === 'string') {
      const numericResult = this.extractNumberFromToolResult(toolResult);
      if (numericResult === undefined) {
        steps.push({
          action: 'save-result',
          error: 'Could not parse numeric result to save.',
        });
        return { goal, steps, final: toolResult };
      }

      const saveArgs = { operation: decision.operation, result: numericResult };
      const saveRes = await this.callTool('save_result', saveArgs);
      steps.push({ action: 'call-tool', tool: 'save_result', args: saveArgs, result: saveRes });
      return { goal, steps, final: saveRes };
    }

    return { goal, steps, final: toolResult };
  }

  async runAgentLoop(goal: string): Promise<{ goal: string; steps: OrchestratorStep[]; final: unknown }> {
    await this.ensureConnected();

    const steps: OrchestratorStep[] = [];
    const tools = await this.buildOpenAiTools();
    steps.push({ action: 'list-tools', result: tools });

    let previousResponseId: string | undefined;
    let finalText: string | undefined;

    for (let turn = 0; turn < 5; turn += 1) {
      const response = await this.createOpenAiResponse({
        input: previousResponseId
          ? [
              {
                type: 'message',
                role: 'user',
                content: [{ type: 'input_text', text: 'Continue. Use tools if needed.' }],
              },
            ]
          : [
              {
                type: 'message',
                role: 'user',
                content: [{ type: 'input_text', text: goal }],
              },
            ],
        tools,
        previous_response_id: previousResponseId,
      });

      previousResponseId = response.id;
      const toolCalls = this.extractToolCalls(response);

      if (toolCalls.length === 0) {
        finalText = response.output_text ?? this.extractOutputText(response.output);
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

        toolOutputs.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: JSON.stringify(toolResult),
        });
      }

      const followup = await this.createOpenAiResponse({
        input: toolOutputs,
        previous_response_id: previousResponseId,
      });

      previousResponseId = followup.id;
      finalText = followup.output_text ?? this.extractOutputText(followup.output);
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

  private async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    await this.ensureConnected();
    return this.client.callTool({ name, arguments: args });
  }

  private async ensureConnected(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.initializing) {
      await this.initializing;
      return;
    }

    this.initializing = this.initializeClient();
    await this.initializing;
    this.initializing = undefined;
  }

  private async initializeClient(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const serverUrl = process.env.MCP_SERVER_URL ?? 'http://localhost:3000/mcp';
    this.transport = new StreamableHTTPClientTransport(new URL(serverUrl));
    this.client = new Client({
      name: 'smart-checkin-orchestrator',
      version: '1.0.0',
    });

    await this.client.connect(this.transport);
    this.initialized = true;
    this.logger.log(`Connected to MCP server at ${serverUrl}`);
  }

  private async buildOpenAiTools(): Promise<unknown[]> {
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

  private async createOpenAiResponse(payload: Record<string, unknown>): Promise<OpenAiResponse> {
    const apiKey = process.env.OPENAI_API_KEY;
    const model = process.env.OPENAI_MODEL;
    const baseUrl = process.env.OPENAI_BASE_URL ?? 'https://api.openai.com/v1';

    this.logger.debug(`OPENAI_API_KEY loaded: ${Boolean(apiKey)}`);

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    if (!model) {
      throw new Error('OPENAI_MODEL is not set');
    }

    const res = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        instructions:
          'You are an orchestration agent. Use available tools to solve the user goal. Return a concise final answer.',
        ...payload,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${text}`);
    }

    return (await res.json()) as OpenAiResponse;
  }

  private extractToolCalls(response: OpenAiResponse): OpenAiToolCall[] {
    const output = response.output ?? [];
    return output.filter((item) => item?.type === 'function_call') as OpenAiToolCall[];
  }

  private extractOutputText(output?: Array<Record<string, unknown>>): string | undefined {
    if (!output) {
      return undefined;
    }
    const message = output.find((item) => item.type === 'message');
    const content = message?.content as Array<{ type?: string; text?: string }> | undefined;
    const textItem = content?.find((c) => c.type === 'output_text');
    return textItem?.text;
  }

  private decidePlan(goal: string): { tool: string; args: Record<string, unknown>; saveResult: boolean; operation?: string } | null {
    const normalized = goal.toLowerCase();
    const nums = this.extractNumbers(goal);
    if (nums.length < 2) {
      return null;
    }

    const operation =
      normalized.includes('add') || normalized.includes('sum') || normalized.includes('plus')
        ? 'add'
        : normalized.includes('subtract') || normalized.includes('minus')
          ? 'subtract'
          : normalized.includes('multiply') || normalized.includes('times')
            ? 'multiply'
            : normalized.includes('divide') || normalized.includes('over')
              ? 'divide'
              : null;

    if (!operation) {
      return null;
    }

    return {
      tool: operation,
      args: { a: nums[0], b: nums[1] },
      saveResult: normalized.includes('save'),
      operation,
    };
  }

  private extractNumbers(text: string): number[] {
    const matches = text.match(/-?\d+(?:\.\d+)?/g) ?? [];
    return matches.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  }

  private extractNumberFromToolResult(result: unknown): number | undefined {
    if (typeof result === 'number') {
      return result;
    }

    if (!result || typeof result !== 'object') {
      return undefined;
    }

    const content = (result as { content?: Array<{ text?: string }> }).content;
    const text = content?.[0]?.text;
    if (!text) {
      return undefined;
    }

    const parsed = Number(text);
    if (Number.isFinite(parsed)) {
      return parsed;
    }

    try {
      const json = JSON.parse(text) as { result?: number; value?: number };
      if (typeof json?.result === 'number') {
        return json.result;
      }
      if (typeof json?.value === 'number') {
        return json.value;
      }
    } catch {
      // ignore
    }

    return undefined;
  }
}
