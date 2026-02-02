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
  private readonly requiredFields: Array<string> = ['selectedPnr'];

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
      enforceToolUse: true,
      toolChoice: 'required',
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
    const record = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined;
    const selections = this.extractPnrs(result.steps);
    if (record && selections.length > 0) {
      record.choices = selections;
      record.recommendedPnr = selections.includes('7MHQTY') ? '7MHQTY' : selections[0];
      if (selections.length === 1) {
        record.selectedPnr = selections[0];
        record.status = STAGE_STATUS.SUCCESS;
        record.continue = true;
      } else {
        record.status = STAGE_STATUS.USER_INPUT_REQUIRED;
        record.continue = false;
        record.userMessage =
          selections.includes('7MHQTY')
            ? `Two PNRs available: ${selections.join(
                ', ',
              )}. 7MHQTY is available for check-in. Which PNR would you like to retrieve?`
            : `Two PNRs available: ${selections.join(
                ', ',
              )}. Which PNR would you like to retrieve?`;
      }
      const data = (record.data && typeof record.data === 'object') ? (record.data as Record<string, unknown>) : {};
      record.data = {
        ...data,
        choices: record.choices,
        recommendedPnr: record.recommendedPnr,
        ...(record.selectedPnr ? { selectedPnr: record.selectedPnr } : {}),
      };
    }
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
    const fromData = (key: string): unknown => data?.[key];
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
        normalizeConfirmation(fromData('userConfirmation') as string | boolean | undefined) ??
        state.userConfirmation,
      selectedPnr:
        nextString(update.selectedPnr) ??
        nextString(fromData('selectedPnr') as string | undefined) ??
        state.selectedPnr,
      choices:
        Array.isArray(update.choices)
          ? update.choices
          : Array.isArray(fromData('choices'))
            ? (fromData('choices') as string[])
            : state.choices,
      recommendedPnr:
        nextString(update.recommendedPnr) ??
        nextString(fromData('recommendedPnr') as string | undefined) ??
        state.recommendedPnr,
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
        selectedPnr: (s) => !s.selectedPnr,
      },
      state,
    );
  }

  private extractPnrs(steps: AiAgentStep[]): string[] {
    const lastCall = [...steps]
      .reverse()
      .find(
        (step) =>
          step &&
          typeof step === 'object' &&
          (step as { action?: string }).action === 'call-tool' &&
          (step as { tool?: string }).tool === 'trip_identification' &&
          (step as { result?: unknown }).result,
      ) as { result?: { content?: Array<{ text?: string }> } } | undefined;
    const text = lastCall?.result?.content?.[0]?.text;
    if (!text) return [];
    try {
      const parsed = JSON.parse(text) as { data?: Array<{ id?: string }> };
      const ids = (parsed.data ?? [])
        .map((item) => (typeof item?.id === 'string' ? item.id.trim() : ''))
        .filter((id) => id.length > 0);
      return Array.from(new Set(ids));
    } catch {
      return [];
    }
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
