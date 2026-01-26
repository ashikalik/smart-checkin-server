import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiAgentService } from '../ai-agent/ai-agent.service';
import { AiAgentStep } from '../ai-agent/ai-agent.types';

@Injectable()
export class IdentificationOrchestratorService {
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
      allowedTools: ['ssci_identification_journey',  'ssci_identification_journey_eligibility', 'ssci_retrieve_order_gql'],
      maxToolEnforcementRetries: this.parseNumber(
        this.configService.get<string>('IDENTIFICATION_ORCHESTRATOR_TOOL_ENFORCE_RETRIES'),
      ) ?? 3,
      maxInvalidToolArgs: this.parseNumber(
        this.configService.get<string>('IDENTIFICATION_ORCHESTRATOR_MAX_INVALID_TOOL_ARGS'),
      ) ?? 5,
      toolUsePrompt: this.buildToolUsePrompt(),
      systemPrompt: this.buildSystemPrompt(),
      continuePrompt:
        this.configService.get<string>('IDENTIFICATION_ORCHESTRATOR_CONTINUE_PROMPT') ??
        'Continue. Use tools if needed.',
      computedNotesTemplate: this.buildComputedNotesTemplate(),
      maxModelCalls: this.parseNumber(this.configService.get<string>('IDENTIFICATION_ORCHESTRATOR_MAX_CALLS')) ?? 6,
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
    return this.getRequiredEnv('IDENTIFICATION_ORCHESTRATOR_SYSTEM_PROMPT');
  }

  private buildToolUsePrompt(): string {
    return this.getRequiredEnv('IDENTIFICATION_ORCHESTRATOR_TOOL_USE_PROMPT');
  }

  private buildComputedNotesTemplate(): string {
    return this.getRequiredEnv('IDENTIFICATION_ORCHESTRATOR_COMPUTED_NOTES_TEMPLATE');
  }

  private getRequiredEnv(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new Error(`${key} is not set`);
    }
    return value;
  }
}
