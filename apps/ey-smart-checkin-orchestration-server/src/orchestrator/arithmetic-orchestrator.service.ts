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
      toolUsePrompt: this.buildToolUsePrompt(),
      systemPrompt: this.buildSystemPrompt(),
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

  private buildSystemPrompt(): string {
    const base =
      this.configService.get<string>('ORCHESTRATOR_SYSTEM_PROMPT') ??
      'You are an arithmetic orchestration agent. You MUST use tools for every arithmetic or percentage calculation step. Use only the numbers from the goal. Do not do math in your head. Use tools repeatedly until all math is done. Return a concise final answer.';
    return base;
  }

  private buildToolUsePrompt(): string {
    const base =
      this.configService.get<string>('ORCHESTRATOR_TOOL_USE_PROMPT') ??
      'You must use tools for every arithmetic step. Use only the numbers from the goal. Recompute using tools only.';
    return base;
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

}
