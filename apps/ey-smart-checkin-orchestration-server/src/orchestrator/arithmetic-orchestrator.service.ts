import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { AiAgentStep } from '../ai-agent/ai-agent.types';

@Injectable()
export class ArithmeticOrchestratorService {
  constructor(
    private readonly agent: AiAgentService,
    private readonly configService: ConfigService,
  ) {}

  listTools(): Promise<{ tools: Array<Record<string, unknown>> }> {
    return this.agent.listTools();
  }

  runAgentLoop(goal: string): Promise<{ goal: string; steps: AiAgentStep[]; final: unknown }> {
    const plan = this.buildArithmeticPlan(goal);
    return this.agent.runAgentLoop(goal, {
      enforceToolUse: true,
      toolChoice: 'auto',
      allowedTools: ['add', 'subtract', 'multiply', 'divide', 'percent'],
      maxToolEnforcementRetries: this.parseNumber(
        this.configService.get<string>('ORCHESTRATOR_TOOL_ENFORCE_RETRIES'),
      ) ?? 3,
      enforceNumbersFromGoal: true,
      maxInvalidToolArgs: this.parseNumber(
        this.configService.get<string>('ORCHESTRATOR_MAX_INVALID_TOOL_ARGS'),
      ) ?? 5,
      toolUsePrompt: this.buildToolUsePrompt(plan),
      systemPrompt: this.buildSystemPrompt(plan),
      continuePrompt:
        this.configService.get<string>('ORCHESTRATOR_CONTINUE_PROMPT') ?? 'Continue. Use tools if needed.',
      computedNotesTemplate: this.buildComputedNotesTemplate(),
      maxModelCalls: this.parseNumber(this.configService.get<string>('ORCHESTRATOR_MAX_CALLS')) ?? 8,
    });
  }

  private parseNumber(value?: string): number | undefined {
    if (!value) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private buildSystemPrompt(plan: string): string {
    const base =
      this.configService.get<string>('ORCHESTRATOR_SYSTEM_PROMPT') ??
      'You are an arithmetic orchestration agent. You MUST use tools for every arithmetic or percentage calculation step. Use only the numbers from the goal. Do not do math in your head. Use tools repeatedly until all math is done. Return a concise final answer.';
    return plan ? `${base}\n${plan}` : base;
  }

  private buildToolUsePrompt(plan: string): string {
    const base =
      this.configService.get<string>('ORCHESTRATOR_TOOL_USE_PROMPT') ??
      'You must use tools for every arithmetic step. Use only the numbers from the goal. Recompute using tools only.';
    return plan ? `${base}\n${plan}` : base;
  }

  private buildComputedNotesTemplate(): string {
    const base =
      this.configService.get<string>('ORCHESTRATOR_COMPUTED_NOTES_TEMPLATE') ??
      'Goal: {goal}\nAllowed numbers: {allowed}\nComputed results so far:\n{notes}\nUse these results. If the goal is fully solved, provide the final answer only. Do not recompute steps.';
    const needsGoal = !base.includes('{goal}');
    const needsAllowed = !base.includes('{allowed}');
    const needsNotes = !base.includes('{notes}');
    const prefix = [
      needsGoal ? 'Goal: {goal}' : null,
      needsAllowed ? 'Allowed numbers: {allowed}' : null,
      needsNotes ? 'Computed results so far:\n{notes}' : null,
    ]
      .filter(Boolean)
      .join('\n');
    if (!prefix) {
      return base;
    }
    return `${prefix}\n${base}`;
  }

  private buildArithmeticPlan(goal: string): string {
    const numbers = this.extractNumbers(goal);
    if (numbers.length < 4) {
      return '';
    }

    const normalized = goal.toLowerCase();
    const hasPercent = normalized.includes('percent') || normalized.includes('percentage');
    const hasSum = normalized.includes('sum') || normalized.includes('add') || normalized.includes('plus');
    const hasMultiply = normalized.includes('multiply') || normalized.includes('multiplied') || normalized.includes('times');
    const hasDivide = /\b(divide|divided|devided|over)\b/i.test(normalized);

    if (!(hasPercent && hasSum && hasMultiply)) {
      return '';
    }

    const percent = numbers[0];
    const a = numbers[1];
    const b = numbers[2];
    const multiplier = numbers[3];
    const divisor = hasDivide ? numbers[4] : undefined;

    const steps = [
      `Step 1: call add with a=${a} and b=${b}.`,
      `Step 2: call multiply with a=<result of Step 1> and b=${multiplier}.`,
    ];
    if (hasDivide && divisor !== undefined) {
      steps.push(`Step 3: call divide with a=<result of Step 2> and b=${divisor}.`);
      steps.push(`Step 4: call percent with percent=${percent} and value=<result of Step 3>.`);
    } else {
      steps.push(`Step 3: call percent with percent=${percent} and value=<result of Step 2>.`);
    }

    return `Planned tool sequence (do not compute manually):\n${steps.join('\n')}`;
  }

  private extractNumbers(text: string): number[] {
    const matches = text.match(/-?\\d+(?:\\.\\d+)?/g) ?? [];
    return matches.map((value) => Number(value)).filter((value) => Number.isFinite(value));
  }
}
