import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiAgentService } from '../../ai-agent/ai-agent.service';
import { AiAgentStep } from '../../ai-agent/ai-agent.types';
import { CheckInState } from '../../shared/checkin-state.enum';
import { StateHelperService } from '../../shared/state-helper.service';
import { StageResponse } from '../../shared/stage-response.type';
import { STAGE_STATUS } from '../../shared/stage-status.type';

@Injectable()
export class JourneyIdentificationAgentService {
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
      enforceToolUse: true,
      toolChoice: 'auto',
      allowedTools: ['ssci_identification_journey',  'ssci_identification_journey_eligibility'],
      maxToolEnforcementRetries: this.parseNumber(
        this.configService.get<string>('JOURNEY_IDENTIFICATION_ORCHESTRATOR_TOOL_ENFORCE_RETRIES'),
      ) ?? 3,
      maxInvalidToolArgs: this.parseNumber(
        this.configService.get<string>('JOURNEY_IDENTIFICATION_ORCHESTRATOR_MAX_INVALID_TOOL_ARGS'),
      ) ?? 5,
      toolUsePrompt: this.buildToolUsePrompt(),
      systemPrompt: this.buildSystemPrompt(),
      continuePrompt:
        this.configService.get<string>('JOURNEY_IDENTIFICATION_ORCHESTRATOR_CONTINUE_PROMPT') ??
        'Continue. Use tools if needed.',
      computedNotesTemplate: this.buildComputedNotesTemplate(),
      maxModelCalls: this.parseNumber(this.configService.get<string>('JOURNEY_IDENTIFICATION_ORCHESTRATOR_MAX_CALLS')) ?? 6,
    });
  }

  async handleStage(
    sessionId: string,
    goal: string,
    stageOverride?: CheckInState,
  ): Promise<StageResponse> {
    const result = await this.runAgentLoop(goal);
    const payload = this.stateHelper.extractFinalObject(result.final) ?? result.final;
    const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined;
    if (record) {
      const hasEligibility = record.eligibility !== undefined && record.eligibility !== null;
      const hasError = Boolean(record.error);
      if (hasEligibility && !hasError) {
        record.status = STAGE_STATUS.SUCCESS;
        record.continue = true;
      } else if (hasError) {
        record.status = STAGE_STATUS.USER_INPUT_REQUIRED;
        record.continue = false;
        if (!record.userMessage && typeof record.error === 'string') {
          record.userMessage = record.error;
        }
      } else if (record.status === undefined) {
        record.status = STAGE_STATUS.FAILED;
        record.continue = false;
      }
    }
    return this.stateHelper.toStageResponse(
      sessionId,
      stageOverride ?? CheckInState.JOURNEY_IDENTIFICATION,
      payload,
      result.steps,
    );
  }

  private parseNumber(value?: string): number | undefined {
    if (!value) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private buildSystemPrompt(): string {
    return this.getRequiredEnv('JOURNEY_IDENTIFICATION_ORCHESTRATOR_SYSTEM_PROMPT');
  }

  private buildToolUsePrompt(): string {
    return this.getRequiredEnv('JOURNEY_IDENTIFICATION_ORCHESTRATOR_TOOL_USE_PROMPT');
  }

  private buildComputedNotesTemplate(): string {
    return this.getRequiredEnv('JOURNEY_IDENTIFICATION_ORCHESTRATOR_COMPUTED_NOTES_TEMPLATE');
  }

  private getRequiredEnv(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new Error(`${key} is not set`);
    }
    return value;
  }
}
