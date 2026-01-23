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

  async runAgentLoop(goal: string): Promise<{ goal: string; steps: OrchestratorStep[]; final: unknown }> {
    await this.ensureConnected();

    const steps: OrchestratorStep[] = [];
    const tools = await this.buildOpenAiTools();
    steps.push({ action: 'list-tools', result: tools });

    let previousResponseId: string | undefined;
    let finalText: string | undefined;
    let forceToolUse = false;
    let remainingCalls = 8;
    const computedNotes: string[] = [];

    while (remainingCalls > 0) {
      const userText = forceToolUse
        ? 'You must use tools for every arithmetic step. Recompute using tools only.'
        : previousResponseId
          ? 'Continue. Use tools if needed.'
          : goal;

      const response = await this.createOpenAiResponse({
        input: [
          {
            type: 'message',
            role: 'user',
            content: [{ type: 'input_text', text: userText }],
          },
        ],
        tools,
        previous_response_id: previousResponseId,
      });
      remainingCalls -= 1;
      previousResponseId = response.id;
      forceToolUse = false;

      const toolCalls = this.extractToolCalls(response);
      if (toolCalls.length === 0) {
        finalText = response.output_text ?? this.extractOutputText(response.output);
        if (finalText && this.needsMoreTools(finalText)) {
          forceToolUse = true;
          continue;
        }
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

      const followup = await this.createOpenAiResponse({
        input: [
          ...toolOutputs,
          {
            type: 'message',
            role: 'user',
            content: [
              {
                type: 'input_text',
                text: `Computed results so far:\n${computedNotes.join('\n')}\nUse these results. If the goal is fully solved, provide the final answer only. Do not recompute steps.`,
              },
            ],
          },
        ],
        previous_response_id: previousResponseId,
      });
      remainingCalls -= 1;
      previousResponseId = followup.id;

      const followupToolCalls = this.extractToolCalls(followup);
      if (followupToolCalls.length > 0) {
        // Continue loop; model asked for more tools after seeing outputs.
        continue;
      }

      finalText = followup.output_text ?? this.extractOutputText(followup.output);
      if (finalText && this.needsMoreTools(finalText)) {
        forceToolUse = true;
        continue;
      }
      if (finalText) {
        break;
      }
    }

    const deterministic = await this.tryDeterministicPercentSumMultiply(goal, steps);
    if (deterministic) {
      return {
        goal,
        steps: deterministic.steps,
        final: deterministic.final,
      };
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
          'You are an orchestration agent. You MUST use tools for every arithmetic or percentage calculation step. Do not do math in your head. Use tools repeatedly until all math is done. Return a concise final answer.',
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

  private formatToolNote(name: string, args: Record<string, unknown>, result: unknown): string {
    const argsText = JSON.stringify(args);
    const resultText = this.extractNumberFromToolResult(result) ?? this.extractTextFromToolResult(result);
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

  private needsMoreTools(text: string): boolean {
    const hasDigits = /\d/.test(text);
    const hasMathWords = /\b(add|subtract|multiply|divide|percent|percentage|times|sum|total|plus|minus|over)\b/i.test(text);
    return hasDigits && hasMathWords;
  }

  private async tryDeterministicPercentSumMultiply(
    goal: string,
    steps: OrchestratorStep[],
  ): Promise<{ steps: OrchestratorStep[]; final: string } | null> {
    const normalized = goal.toLowerCase();
    const matchesPattern =
      (normalized.includes('percent') || normalized.includes('percentage')) &&
      (normalized.includes('sum') || normalized.includes('add') || normalized.includes('plus')) &&
      (normalized.includes('multiply') || normalized.includes('multiplied') || normalized.includes('times'));

    if (!matchesPattern) {
      return null;
    }

    const wantsDivide = /\b(divide|divided|devided|over)\b/i.test(normalized);
    const requiredSequence = wantsDivide ? ['add', 'multiply', 'divide', 'percent'] : ['add', 'multiply', 'percent'];
    if (this.hasToolSequence(steps, requiredSequence)) {
      return null;
    }

    const numbers = this.extractNumbers(goal);
    if (numbers.length < 4) {
      return null;
    }

    const percent = numbers[0];
    const a = numbers[1];
    const b = numbers[2];
    const multiplier = numbers[3];
    const divisor = wantsDivide ? numbers[4] : undefined;

    const addResult = await this.callTool('add', { a, b });
    steps.push({ action: 'call-tool', tool: 'add', args: { a, b }, result: addResult });

    const sum = this.extractNumberFromToolResult(addResult);
    if (sum === undefined) {
      return null;
    }

    const multiplyResult = await this.callTool('multiply', { a: sum, b: multiplier });
    steps.push({
      action: 'call-tool',
      tool: 'multiply',
      args: { a: sum, b: multiplier },
      result: multiplyResult,
    });

    const product = this.extractNumberFromToolResult(multiplyResult);
    if (product === undefined) {
      return null;
    }

    let baseValue = product;
    if (wantsDivide) {
      if (divisor === undefined) {
        return null;
      }
      const divideResult = await this.callTool('divide', { a: product, b: divisor });
      steps.push({
        action: 'call-tool',
        tool: 'divide',
        args: { a: product, b: divisor },
        result: divideResult,
      });
      const divided = this.extractNumberFromToolResult(divideResult);
      if (divided === undefined) {
        return null;
      }
      baseValue = divided;
    }

    const percentResult = await this.callTool('percent', { percent, value: baseValue });
    steps.push({
      action: 'call-tool',
      tool: 'percent',
      args: { percent, value: baseValue },
      result: percentResult,
    });

    const finalNumber = this.extractNumberFromToolResult(percentResult);
    if (finalNumber === undefined) {
      return null;
    }

    return {
      steps,
      final: `Final answer: ${finalNumber}`,
    };
  }

  private hasToolSequence(steps: OrchestratorStep[], sequence: string[]): boolean {
    let index = 0;
    for (const step of steps) {
      if (step.action !== 'call-tool' || !step.tool) {
        continue;
      }
      if (step.tool === sequence[index]) {
        index += 1;
        if (index >= sequence.length) {
          return true;
        }
      }
    }
    return false;
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
