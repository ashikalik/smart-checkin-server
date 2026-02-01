import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiAgentService } from '../../ai-agent/ai-agent.service';
import { AiAgentStep } from '../../ai-agent/ai-agent.types';
import { CheckInState } from '../../shared/checkin-state.enum';
import { StateHelperService } from '../../shared/state-helper.service';
import { StageResponse } from '../../shared/stage-response.type';
import { STAGE_STATUS } from '../../shared/stage-status.type';

@Injectable()
export class ValidateProcessCheckInAgentService {
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
      allowedTools: ['ssci_validate_process_checkin'],
      maxToolEnforcementRetries: this.parseNumber(
        this.configService.get<string>('VALIDATE_PROCESS_CHECKIN_ORCHESTRATOR_TOOL_ENFORCE_RETRIES'),
      ) ?? 3,
      maxInvalidToolArgs: this.parseNumber(
        this.configService.get<string>('VALIDATE_PROCESS_CHECKIN_ORCHESTRATOR_MAX_INVALID_TOOL_ARGS'),
      ) ?? 5,
      toolUsePrompt: this.buildToolUsePrompt(),
      systemPrompt: this.buildSystemPrompt(),
      continuePrompt:
        this.configService.get<string>('VALIDATE_PROCESS_CHECKIN_ORCHESTRATOR_CONTINUE_PROMPT') ??
        'Continue. Use tools if needed.',
      computedNotesTemplate: this.buildComputedNotesTemplate(),
      maxModelCalls: this.parseNumber(this.configService.get<string>('VALIDATE_PROCESS_CHECKIN_ORCHESTRATOR_MAX_CALLS')) ?? 6,
    });
  }

  async handleStage(
    sessionId: string,
    goal: string,
  ): Promise<StageResponse> {
    const result = await this.runAgentLoop(goal);
    const payload = this.stateHelper.extractFinalObject(result.final) ?? result.final;
    const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined;
    if (record) {
      const state = await this.stateHelper.stateService.getState(sessionId);
      const userLastName = state?.beginConversation?.lastName;
      const passengers = Array.isArray(record.passengersToCheckIn)
        ? (record.passengersToCheckIn as Array<Record<string, unknown>>)
        : [];
      const journeyElementId =
        typeof passengers[0]?.journeyElementId === 'string' && passengers[0].journeyElementId.trim().length > 0
          ? String(passengers[0].journeyElementId)
          : undefined;
      const travelerId =
        typeof passengers[0]?.travelerId === 'string' && passengers[0].travelerId.trim().length > 0
          ? String(passengers[0].travelerId)
          : undefined;
      if (travelerId) {
        const nextState = {
          ...state,
          data: {
            ...(state?.data ?? {}),
            travelerId,
            ...(journeyElementId ? { journeyElementId } : {}),
          },
        };
        if (state) {
          await this.stateHelper.stateService.saveState(sessionId, nextState);
        }
      }
      const firstName =
        typeof passengers[0]?.firstName === 'string' && passengers[0]?.firstName.trim().length > 0
          ? String(passengers[0].firstName)
          : undefined;
      const lastName =
        typeof userLastName === 'string' && userLastName.trim().length > 0
          ? userLastName.trim()
          : typeof passengers[0]?.lastName === 'string'
            ? String(passengers[0].lastName)
            : undefined;
      const personalizedPrompt =
        firstName || lastName
          ? `Do you want to check in this passenger: ${[firstName, lastName].filter(Boolean).join(' ')}?`
          : undefined;
      const prompt = typeof record.prompt === 'string' ? record.prompt : undefined;
      const hasError = Boolean(record.error);
      if (prompt) {
        record.status = STAGE_STATUS.USER_INPUT_REQUIRED;
        record.continue = false;
        if (!record.userMessage) {
          record.userMessage = personalizedPrompt ?? prompt;
        }
      } else if (hasError) {
        record.status = STAGE_STATUS.FAILED;
        record.continue = false;
      } else if (record.status === undefined) {
        record.status = STAGE_STATUS.SUCCESS;
        record.continue = true;
      }
    }
    return this.stateHelper.toStageResponse(sessionId, CheckInState.VALIDATE_PROCESS_CHECKIN, payload, result.steps);
  }

  private parseNumber(value?: string): number | undefined {
    if (!value) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private buildSystemPrompt(): string {
    return this.getRequiredEnv('VALIDATE_PROCESS_CHECKIN_ORCHESTRATOR_SYSTEM_PROMPT');
  }

  private buildToolUsePrompt(): string {
    return this.getRequiredEnv('VALIDATE_PROCESS_CHECKIN_ORCHESTRATOR_TOOL_USE_PROMPT');
  }

  private buildComputedNotesTemplate(): string {
    return this.getRequiredEnv('VALIDATE_PROCESS_CHECKIN_ORCHESTRATOR_COMPUTED_NOTES_TEMPLATE');
  }

  private getRequiredEnv(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new Error(`${key} is not set`);
    }
    return value;
  }
}
