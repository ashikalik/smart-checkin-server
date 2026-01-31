import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiAgentService } from '../../ai-agent/ai-agent.service';
import { AiAgentStep } from '../../ai-agent/ai-agent.types';
import { CheckInState } from '../../shared/checkin-state.enum';
import { StateHelperService } from '../../shared/state-helper.service';
import { StageResponse } from '../../shared/stage-response.type';

@Injectable()
export class BeginConversationAgentService {
  constructor(
    private readonly agent: AiAgentService,
    private readonly configService: ConfigService,
    private readonly stateHelper: StateHelperService,
  ) {}

  listTools(): Promise<{ tools: Array<Record<string, unknown>> }> {
    return this.agent.listTools();
  }

  runAgentLoop(goal: string): Promise<{ goal: string; steps: AiAgentStep[]; final: unknown }> {
    return this.agent.runAgentLoop(goal, {
      enforceToolUse: false,
      toolChoice: 'auto',
      allowedTools: [],
      maxToolEnforcementRetries: this.parseNumber(
        this.configService.get<string>('BEGIN_CONVERSATION_TOOL_ENFORCE_RETRIES'),
      ) ?? 0,
      maxInvalidToolArgs: this.parseNumber(
        this.configService.get<string>('BEGIN_CONVERSATION_MAX_INVALID_TOOL_ARGS'),
      ) ?? 0,
      toolUsePrompt: this.configService.get<string>('BEGIN_CONVERSATION_TOOL_USE_PROMPT'),
      systemPrompt: this.buildSystemPrompt(),
      continuePrompt:
        this.configService.get<string>('BEGIN_CONVERSATION_CONTINUE_PROMPT') ??
        'Continue. Return JSON only.',
      computedNotesTemplate: this.buildComputedNotesTemplate(),
      maxModelCalls: this.parseNumber(this.configService.get<string>('BEGIN_CONVERSATION_MAX_CALLS')) ?? 3,
    });
  }

  async handleStage(
    sessionId: string,
    goal: string,
  ): Promise<StageResponse> {
    const result = await this.runAgentLoop(goal);
    const payload = this.stateHelper.extractFinalObject(result.final) ?? result.final;
    return this.stateHelper.toStageResponse(sessionId, CheckInState.BEGIN_CONVERSATION, payload, result.steps);
  }

  private parseNumber(value?: string): number | undefined {
    if (!value) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private buildSystemPrompt(): string {
    return this.getRequiredEnv('BEGIN_CONVERSATION_SYSTEM_PROMPT');
  }

  private buildComputedNotesTemplate(): string {
    return this.getRequiredEnv('BEGIN_CONVERSATION_COMPUTED_NOTES_TEMPLATE');
  }

  private getRequiredEnv(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new Error(`${key} is not set`);
    }
    return value;
  }
}
