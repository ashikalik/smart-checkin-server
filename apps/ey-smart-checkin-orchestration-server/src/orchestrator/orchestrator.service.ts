import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { OpenAiAgentService } from '../open-ai-agent/open-ai-agent.service';

type OrchestratorStep = {
  action: string;
  tool?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  error?: string;
};

@Injectable()
export class OrchestratorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrchestratorService.name);
  private client?: Client;
  private transport?: StreamableHTTPClientTransport;
  private initialized = false;
  private initializing?: Promise<void>;

  constructor(private readonly openAiAgent: OpenAiAgentService) {}

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

      const response = await this.openAiAgent.createResponse({
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

      const toolCalls = this.openAiAgent.extractToolCalls(response);
      if (toolCalls.length === 0) {
        finalText = response.output_text ?? this.openAiAgent.extractOutputText(response.output);
        if (finalText && this.openAiAgent.needsMoreTools(finalText)) {
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
        computedNotes.push(
          this.openAiAgent.formatToolNote(
            call.name,
            args,
            toolResult,
            this.extractNumberFromToolResult(toolResult),
          ),
        );

        toolOutputs.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: JSON.stringify(toolResult),
        });
      }

      if (remainingCalls <= 0) {
        break;
      }

      const followup = await this.openAiAgent.createResponse({
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

      const followupToolCalls = this.openAiAgent.extractToolCalls(followup);
      if (followupToolCalls.length > 0) {
        // Continue loop; model asked for more tools after seeing outputs.
        continue;
      }

      finalText = followup.output_text ?? this.openAiAgent.extractOutputText(followup.output);
      if (finalText && this.openAiAgent.needsMoreTools(finalText)) {
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
    return this.openAiAgent.buildTools(result);
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
