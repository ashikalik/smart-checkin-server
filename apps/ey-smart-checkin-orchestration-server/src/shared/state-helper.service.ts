import { Injectable } from '@nestjs/common';
import { BaseState } from './base-state.interface';
import { CheckInState } from './checkin-state.enum';
import { StageStatus, STAGE_STATUS } from './stage-status.type';
import { OrchestratorState } from '../state/state-store.interface';
import { StateService } from '../state/state.service';
import { v4 as uuidv4, validate as validateUuid } from 'uuid';
import { StageResponse } from './stage-response.type';
import { SessionState } from './session-state.interface';

@Injectable()
export class StateHelperService {
  constructor(public readonly stateService: StateService) {}
  extractFinalObject(final: unknown): Record<string, unknown> | undefined {
    if (!final) {
      return undefined;
    }
    if (typeof final === 'object') {
      return final as Record<string, unknown>;
    }
    if (typeof final === 'string') {
      try {
        return JSON.parse(final) as Record<string, unknown>;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  toStageResponse(sessionId: string, stage: CheckInState, payload: unknown, steps: unknown): StageResponse {
    const base = this.normalizeBaseState(payload);
    const data = this.buildDataPayload(payload);
    const sanitized = this.sanitizePayload(payload);
    return {
      sessionId,
      stage: this.toStageKey(stage),
      ...(sanitized ?? {}),
      ...(data !== undefined ? { data } : {}),
      ...base,
    };
  }

  normalizeBaseState(payload: unknown): BaseState {
    const now = new Date().toISOString();
    if (!payload || typeof payload !== 'object') {
      return {
        status: STAGE_STATUS.FAILED,
        continue: false,
        updatedAtUtc: now,
        userMessage: 'Invalid agent response.',
        error: { code: 'invalid_response' },
      };
    }

    const record = payload as Record<string, unknown>;
    const status = isStageStatus(record.status) ? record.status : STAGE_STATUS.FAILED;
    const continueFlag = typeof record.continue === 'boolean' ? record.continue : false;
    return {
      status,
      continue: continueFlag,
      updatedAtUtc: typeof record.updatedAtUtc === 'string' ? record.updatedAtUtc : now,
      startedAtUtc: typeof record.startedAtUtc === 'string' ? record.startedAtUtc : undefined,
      completedAtUtc: typeof record.completedAtUtc === 'string' ? record.completedAtUtc : undefined,
      lastEventId: typeof record.lastEventId === 'string' ? record.lastEventId : undefined,
      attempt: typeof record.attempt === 'number' ? record.attempt : undefined,
      error: typeof record.error === 'object' ? (record.error as BaseState['error']) : undefined,
      userMessage: typeof record.userMessage === 'string' ? record.userMessage : undefined,
    };
  }

  buildInitialResponse(sessionId: string): StageResponse {
    return {
      sessionId,
      stage: this.toStageKey(CheckInState.BEGIN_CONVERSATION),
      status: STAGE_STATUS.USER_INPUT_REQUIRED,
      continue: false,
      updatedAtUtc: new Date().toISOString(),
      userMessage: 'Please provide your frequent flyer number or booking reference, plus your last name.',
    };
  }

  buildUnknownStageResponse(sessionId: string, stage: CheckInState): StageResponse {
    return {
      sessionId,
      stage: this.toStageKey(stage),
      status: STAGE_STATUS.FAILED,
      continue: false,
      updatedAtUtc: new Date().toISOString(),
      userMessage: `No orchestrator configured for stage ${stage}.`,
    };
  }

  private toStageKey(stage: CheckInState): string {
    return stage
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/-/g, '_')
      .toUpperCase();
  }

  private buildDataPayload(payload: unknown): Record<string, unknown> | null | undefined {
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    const record = payload as Record<string, unknown>;
    if ('data' in record) {
      const existing = record.data;
      if (existing && typeof existing === 'object') {
        return existing as Record<string, unknown>;
      }
      return existing === null ? null : undefined;
    }
    const excluded = new Set([
      'status',
      'continue',
      'updatedAtUtc',
      'startedAtUtc',
      'completedAtUtc',
      'lastEventId',
      'attempt',
      'error',
      'userMessage',
      'missing',
      'steps',
      'sessionId',
      'stage',
    ]);
    const extras: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (excluded.has(key)) continue;
      extras[key] = value;
    }
    return Object.keys(extras).length > 0 ? extras : null;
  }

  private sanitizePayload(payload: unknown): Record<string, unknown> | undefined {
    if (!payload || typeof payload !== 'object') {
      return undefined;
    }
    const record = payload as Record<string, unknown>;
    const excluded = new Set([
      'status',
      'continue',
      'updatedAtUtc',
      'startedAtUtc',
      'completedAtUtc',
      'lastEventId',
      'attempt',
      'error',
      'userMessage',
      'missing',
      'steps',
      'sessionId',
      'stage',
      'data',
    ]);
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      if (excluded.has(key)) {
        cleaned[key] = value;
      }
    }
    return Object.keys(cleaned).length > 0 ? cleaned : undefined;
  }

  buildInitialState(sessionId: string): OrchestratorState {
    const base = this.buildBaseState(STAGE_STATUS.NOT_STARTED);
    return {
      sessionId,
      currentStage: CheckInState.BEGIN_CONVERSATION,
      beginConversation: { ...base },
      tripIdentificationState: { ...base },
      tripSelectionState: { ...base },
      journeyIdentificationState: { ...base },
      journeySelectionState: { ...base },
      passengerIdentificationState: { ...base },
      passengerSelectionState: { ...base },
      validateProcessCheckInState: { ...base },
      processCheckInState: { ...base },
      checkinAcceptanceState: { ...base },
      boardingPassState: { ...base },
      regulatoryDetailsState: { ...base },
    };
  }

  getCurrentStage(state: OrchestratorState): CheckInState {
    const stage = state.currentStage;
    return Object.values(CheckInState).includes(stage as CheckInState)
      ? (stage as CheckInState)
      : CheckInState.BEGIN_CONVERSATION;
  }

  private buildBaseState(status: StageStatus): BaseState {
    const now = new Date().toISOString();
    return {
      status,
      continue: false,
      updatedAtUtc: now,
      startedAtUtc: now,
    };
  }

  async resolveSession(
    sessionId: string | undefined,
  ): Promise<{ sessionId: string; state: OrchestratorState; response?: StageResponse }> {
    const trimmed = typeof sessionId === 'string' ? sessionId.trim() : undefined;
    const currentSessionId = trimmed && trimmed !== 'null' && validateUuid(trimmed) ? trimmed : uuidv4();
    const state = (await this.stateService.getState(currentSessionId)) ?? this.buildInitialState(currentSessionId);

    if (!sessionId) {
      await this.stateService.saveState(currentSessionId, state);
      return {
        sessionId: currentSessionId,
        state,
        response: this.buildInitialResponse(currentSessionId),
      };
    }

    return { sessionId: currentSessionId, state };
  }

  computeRequiredFields<T extends object>(
    required: string[],
    checks: Record<string, (state: T) => boolean>,
    state: T,
    labels: Record<string, string> = {},
  ): string[] | undefined {
    const missing: string[] = [];
    for (const field of required) {
      const isMissing = checks[field]?.(state);
      if (isMissing) {
        missing.push(labels[field] ?? field);
      }
    }
    return missing.length > 0 ? missing : undefined;
  }

  buildContext(state: SessionState): string {
    const parts: string[] = [];
    if (state.beginConversation?.frequentFlyerNumber) {
      parts.push(`frequentFlyerNumber: ${state.beginConversation.frequentFlyerNumber}`);
    }
    if (state.beginConversation?.bookingReference) {
      parts.push(`bookingReference: ${state.beginConversation.bookingReference}`);
    }
    if (state.beginConversation?.lastName) {
      parts.push(`lastName: ${state.beginConversation.lastName}`);
    }
    if (state.beginConversation?.firstName) {
      parts.push(`firstName: ${state.beginConversation.firstName}`);
    }
    return parts.length > 0 ? parts.join('\n') : '';
  }
}

const isStageStatus = (value: unknown): value is StageStatus =>
  value === STAGE_STATUS.NOT_STARTED ||
  value === STAGE_STATUS.IN_PROGRESS ||
  value === STAGE_STATUS.SUCCESS ||
  value === STAGE_STATUS.FAILED ||
  value === STAGE_STATUS.USER_INPUT_REQUIRED;
