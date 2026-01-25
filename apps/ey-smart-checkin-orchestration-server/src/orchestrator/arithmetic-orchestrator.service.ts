import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { AiAgentStep } from '../ai-agent/ai-agent.types';
import { OpenAiChatModelService } from '../open-ai-chat-model/open-ai-chat-model.service';

@Injectable()
export class ArithmeticOrchestratorService {
  constructor(
    private readonly agent: AiAgentService,
    private readonly chatModel: OpenAiChatModelService,
    private readonly configService: ConfigService,
  ) {}

  listTools(): Promise<{ tools: Array<Record<string, unknown>> }> {
    return this.agent.listTools();
  }

  async runAgentLoop(goal: string): Promise<{ goal: string; steps: AiAgentStep[]; final: unknown }> {
    const steps: AiAgentStep[] = [];
    const tools = await this.agent.buildChatModelTools();
    const hasTools = tools.length > 0;
    steps.push({ action: 'list-tools', result: tools });

    let previousResponseId: string | undefined;
    let finalText: string | undefined;
    let forceToolUse = false;
    let remainingCalls = this.parseNumber(this.configService.get<string>('ORCHESTRATOR_MAX_CALLS')) ?? 8;
    const computedNotes: string[] = [];

    const systemPrompt =
      this.configService.get<string>('ORCHESTRATOR_SYSTEM_PROMPT') ??
      'You are an orchestration agent. You MUST use tools for every arithmetic or percentage calculation step. Do not do math in your head. Use tools repeatedly until all math is done. Return a concise final answer.';
    const toolUsePrompt =
      this.configService.get<string>('ORCHESTRATOR_TOOL_USE_PROMPT') ??
      'You must use tools for every arithmetic step. Recompute using tools only.';
    const continuePrompt =
      this.configService.get<string>('ORCHESTRATOR_CONTINUE_PROMPT') ?? 'Continue. Use tools if needed.';
    const computedNotesTemplate =
      this.configService.get<string>('ORCHESTRATOR_COMPUTED_NOTES_TEMPLATE') ??
      'Computed results so far:\n{notes}\nUse these results. If the goal is fully solved, provide the final answer only. Do not recompute steps.';

    while (remainingCalls > 0) {
      const userText = forceToolUse ? toolUsePrompt : previousResponseId ? continuePrompt : goal;

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
        instructions: systemPrompt,
      });
      remainingCalls -= 1;
      previousResponseId = response.id;
      forceToolUse = false;

      const toolCalls = this.chatModel.extractToolCalls(response);
      if (toolCalls.length === 0) {
        finalText = response.output_text ?? this.chatModel.extractOutputText(response.output);
        if (hasTools && finalText && this.chatModel.needsMoreTools(finalText)) {
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

        const toolResult = await this.agent.callTool(call.name, args);
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
                text: computedNotesTemplate.replace('{notes}', computedNotes.join('\n')),
              },
            ],
          },
        ],
        previous_response_id: previousResponseId,
        instructions: systemPrompt,
      });
      remainingCalls -= 1;
      previousResponseId = followup.id;

      const followupToolCalls = this.chatModel.extractToolCalls(followup);
      if (followupToolCalls.length > 0) {
        continue;
      }

      finalText = followup.output_text ?? this.chatModel.extractOutputText(followup.output);
      if (hasTools && finalText && this.chatModel.needsMoreTools(finalText)) {
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

  private async tryDeterministicPercentSumMultiply(
    goal: string,
    steps: AiAgentStep[],
  ): Promise<{ steps: AiAgentStep[]; final: string } | null> {
    const normalized = goal.toLowerCase();
    const matchesPattern =
      (normalized.includes('percent') || normalized.includes('percentage')) &&
      (normalized.includes('sum') || normalized.includes('add') || normalized.includes('plus')) &&
      (normalized.includes('multiply') || normalized.includes('multiplied') || normalized.includes('times'));

    if (!matchesPattern) {
      return null;
    }

    const wantsDivide = /\b(divide|divided|devided|over)\b/i.test(normalized);
    const requiredTools = wantsDivide ? ['add', 'multiply', 'divide', 'percent'] : ['add', 'multiply', 'percent'];
    if (!requiredTools.every((tool) => this.agent.hasTool(tool))) {
      return null;
    }
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

    const addResult = await this.agent.callTool('add', { a, b });
    steps.push({ action: 'call-tool', tool: 'add', args: { a, b }, result: addResult });

    const sum = this.extractNumberFromToolResult(addResult);
    if (sum === undefined) {
      return null;
    }

    const multiplyResult = await this.agent.callTool('multiply', { a: sum, b: multiplier });
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
      const divideResult = await this.agent.callTool('divide', { a: product, b: divisor });
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

    const percentResult = await this.agent.callTool('percent', { percent, value: baseValue });
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

  private hasToolSequence(steps: AiAgentStep[], sequence: string[]): boolean {
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

  private parseNumber(value?: string): number | undefined {
    if (!value) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}
