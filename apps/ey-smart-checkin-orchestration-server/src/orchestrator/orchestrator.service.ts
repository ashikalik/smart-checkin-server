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
