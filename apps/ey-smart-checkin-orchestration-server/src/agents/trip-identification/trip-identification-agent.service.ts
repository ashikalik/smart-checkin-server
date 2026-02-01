import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiAgentService } from '../../ai-agent/ai-agent.service';
import { AiAgentStep } from '../../ai-agent/ai-agent.types';
import { CheckInState } from '../../shared/checkin-state.enum';
import { StateHelperService } from '../../shared/state-helper.service';
import { StageResponse } from '../../shared/stage-response.type';
import { TripIdentificationState } from '../../shared/trip-identification-state.interface';
import { STAGE_STATUS } from '../../shared/stage-status.type';

@Injectable()
export class TripIdentificationAgentService {
  private readonly requiredFields: Array<string> = ['userConfirmation'];

  constructor(
    private readonly agent: AiAgentService,
    private readonly configService: ConfigService,
    private readonly stateHelper: StateHelperService,
  ) {}

  listTools(): Promise<{ tools: Array<Record<string, unknown>> }> {
    return this.agent.listTools();
  }

  runAgentLoop(goal: string, context?: string): Promise<{ goal: string; steps: AiAgentStep[]; final: unknown }> {
    return this.agent.runAgentLoop(goal, {
      enforceToolUse: false,
      toolChoice: 'auto',
      allowedTools: ['trip_identification'],
      maxToolEnforcementRetries: this.parseNumber(
        this.configService.get<string>('TRIP_IDENTIFICATION_TOOL_ENFORCE_RETRIES'),
      ) ?? 3,
      maxInvalidToolArgs: this.parseNumber(
        this.configService.get<string>('TRIP_IDENTIFICATION_MAX_INVALID_TOOL_ARGS'),
      ) ?? 5,
      toolUsePrompt: this.buildToolUsePrompt(),
      systemPrompt: this.buildSystemPrompt(context),
      continuePrompt:
        this.configService.get<string>('TRIP_IDENTIFICATION_CONTINUE_PROMPT') ??
        'Continue. Use tools if needed.',
      computedNotesTemplate: this.buildComputedNotesTemplate(),
      maxModelCalls: this.parseNumber(this.configService.get<string>('TRIP_IDENTIFICATION_MAX_CALLS')) ?? 6,
    });
  }

  async handleStage(
    sessionId: string,
    goal: string,
    context?: string,
  ): Promise<StageResponse> {
    const result = await this.runAgentLoop(goal, context);
    const payload = this.stateHelper.extractFinalObject(result.final) ?? result.final;
    return this.stateHelper.toStageResponse(sessionId, CheckInState.TRIP_IDENTIFICATION, payload, result.steps);
  }

  updateTripIdentificationState(
    state: TripIdentificationState,
    update: Partial<TripIdentificationState>,
  ): TripIdentificationState {
    const nextString = (value?: string): string | undefined => {
      if (value === undefined || value === null) return undefined;
      const trimmed = value.trim();
      return trimmed.length === 0 ? undefined : trimmed;
    };
    const normalizeConfirmation = (value?: string | boolean): string | undefined => {
      if (typeof value === 'boolean') {
        return value ? 'CONFIRMED' : 'REFUSED';
      }
      const trimmed = nextString(value as string | undefined);
      return trimmed ? trimmed.toUpperCase() : undefined;
    };
    const data = (update as { data?: Record<string, unknown> }).data;
    const fromData = (key: string): string | boolean | undefined => {
      const value = data?.[key];
      return typeof value === 'string' || typeof value === 'boolean' ? value : undefined;
    };
    const merged: TripIdentificationState = {
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
      orderPreviewsListReply: update.orderPreviewsListReply ?? state.orderPreviewsListReply,
      userConfirmation:
        normalizeConfirmation(update.userConfirmation) ??
        normalizeConfirmation(fromData('userConfirmation')) ??
        state.userConfirmation,
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

  private validateRequired(state: TripIdentificationState): string[] | undefined {
    return this.stateHelper.computeRequiredFields<TripIdentificationState>(
      this.requiredFields,
      {
        userConfirmation: (s) => s.userConfirmation !== 'CONFIRMED',
      },
      state,
    );
  }

  private parseNumber(value?: string): number | undefined {
    if (!value) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private buildSystemPrompt(context?: string): string {
    const base = this.getRequiredEnv('TRIP_IDENTIFICATION_SYSTEM_PROMPT');
    if (!context || context.trim().length === 0) {
      return base;
    }
    return `${base}\n\nContext (from session state, trusted):\n${context}`;
  }

  private buildToolUsePrompt(): string {
    return this.getRequiredEnv('TRIP_IDENTIFICATION_TOOL_USE_PROMPT');
  }

  private buildComputedNotesTemplate(): string {
    return this.getRequiredEnv('TRIP_IDENTIFICATION_COMPUTED_NOTES_TEMPLATE');
  }

  private getRequiredEnv(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new Error(`${key} is not set`);
    }
    return value;
  }
}
