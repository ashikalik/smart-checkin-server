import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiAgentService } from '../../ai-agent/ai-agent.service';
import { AiAgentStep } from '../../ai-agent/ai-agent.types';
import { CheckInState } from '../../shared/checkin-state.enum';
import { BeginConversationState } from '../../shared/begin-conversation-state';
import { StateHelperService } from '../../shared/state-helper.service';
import { StageResponse } from '../../shared/stage-response.type';
import { STAGE_STATUS } from '../../shared/stage-status.type';

@Injectable()
export class BeginConversationAgentService {
  private readonly requiredFields: Array<string> = [
    'lastName',
    'frequentFlyerOrBookingReference',
  ];

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
    const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined;
    if (record) {
      const bookingReferenceFromGoal = goal.match(/\b(bookingReference|pnr)\s+([A-Za-z0-9]{5,8})\b/i)?.[2];
      const lastNameFromGoal = goal.match(/\blastName\s+([A-Za-z]+)/i)?.[1];
      if (bookingReferenceFromGoal && !record.bookingReference) {
        record.bookingReference = bookingReferenceFromGoal;
      }
      if (lastNameFromGoal && !record.lastName) {
        record.lastName = lastNameFromGoal;
      }
    }
    console.log("--------------------------------------------------------")
    console.log(payload);
    console.log("--------------------------------------------------------")
    return this.stateHelper.toStageResponse(sessionId, CheckInState.BEGIN_CONVERSATION, payload, result.steps);
  }

  updateBeginConversationState(
    state: BeginConversationState,
    update: Partial<BeginConversationState>,
  ): BeginConversationState {
    const next = (value?: string): string | undefined => {
      if (value === undefined || value === null) return undefined;
      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    };
    const data = (update as { data?: Record<string, unknown> }).data;
    const fromData = (key: string): string | undefined => {
      const value = data?.[key];
      return typeof value === 'string' ? value : undefined;
    };
    const merged: BeginConversationState = {
      ...state,
      status: update.status ?? state.status,
      continue: update.continue ?? state.continue,
      updatedAtUtc: update.updatedAtUtc ?? state.updatedAtUtc,
      startedAtUtc: update.startedAtUtc ?? state.startedAtUtc,
      completedAtUtc: update.completedAtUtc ?? state.completedAtUtc,
      lastEventId: update.lastEventId ?? state.lastEventId,
      attempt: update.attempt ?? state.attempt,
      error: update.error ?? state.error,
      userMessage: update.userMessage ?? state.userMessage,
      frequentFlyerNumber:
        next(update.frequentFlyerNumber) ?? next(fromData('frequentFlyerNumber')) ?? state.frequentFlyerNumber,
      bookingReference:
        next(update.bookingReference) ?? next(fromData('bookingReference')) ?? state.bookingReference,
      lastName: next(update.lastName) ?? next(fromData('lastName')) ?? state.lastName,
      firstName: next(update.firstName) ?? next(fromData('firstName')) ?? state.firstName,
    };
    const missing = this.validateRequired(merged);
    const ready = !missing || missing.length === 0;
    return {
      ...merged,
      status: ready ? STAGE_STATUS.SUCCESS : STAGE_STATUS.USER_INPUT_REQUIRED,
      continue: ready,
      userMessage: ready ? undefined : merged.userMessage,
      missing,
    };
  }

  private validateRequired(state: BeginConversationState): string[] | undefined {
    return this.stateHelper.computeRequiredFields<BeginConversationState>(
      this.requiredFields,
      {
        lastName: (s) => !s.lastName,
        frequentFlyerOrBookingReference: (s) => !s.frequentFlyerNumber && !s.bookingReference,
      },
      state,
      {
        frequentFlyerOrBookingReference: 'frequentFlyerNumber or bookingReference',
      },
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
