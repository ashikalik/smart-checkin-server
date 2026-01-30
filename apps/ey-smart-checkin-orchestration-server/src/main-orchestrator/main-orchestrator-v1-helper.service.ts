import { Injectable } from '@nestjs/common';
import { BeginConversationAgentService } from '../agents/begin-conversation/begin-conversation-agent.service';
import { BaseState } from '../shared/base-state.interface';
import { StageStatus, STAGE_STATUS } from '../shared/stage-status.type';
import { CheckInState } from '../shared/checkin-state.enum';
import { OrchestratorState } from '../state/state-store.interface';
import { TripIdentificationAgentService } from '../agents/trip-identification/trip-identification-agent.service';
import { StateService } from '../state/state.service';

@Injectable()
export class MainOrchestratorV1HelperService {
  buildInitialState(sessionId: string): OrchestratorState {
    return {
      sessionId,
      data: {
        currentStage: CheckInState.BEGIN_CONVERSATION,
      },
    };
  }

  getCurrentStage(data: Record<string, unknown>): CheckInState {
    const stage = data.currentStage;
    return Object.values(CheckInState).includes(stage as CheckInState)
      ? (stage as CheckInState)
      : CheckInState.BEGIN_CONVERSATION;
  }

  async advanceToTripIdentification(
    state: OrchestratorState,
    goal: string,
    tripIdentification: TripIdentificationAgentService,
    stateService: StateService,
  ): Promise<Record<string, unknown>> {
    const nextState: OrchestratorState = {
      ...state,
      data: {
        ...(state.data ?? {}),
        currentStage: CheckInState.TRIP_IDENTIFICATION,
      },
    };
    await stateService.saveState(state.sessionId, nextState);
    return this.runTripIdentification(nextState, goal, tripIdentification);
  }

  async runTripIdentification(
    state: OrchestratorState,
    goal: string,
    tripIdentification: TripIdentificationAgentService,
  ): Promise<StageResponse> {
    const result = await tripIdentification.runAgentLoop(goal);
    const payload = this.extractFinalObject(result.final) ?? result.final;
    return this.toStageResponse(state.sessionId, CheckInState.TRIP_IDENTIFICATION, payload, result.steps);
  }

  async runBeginConversation(
    state: OrchestratorState,
    goal: string,
    beginConversation: BeginConversationAgentService,
  ): Promise<StageResponse> {
    const result = await beginConversation.runAgentLoop(goal);
    const payload = this.extractFinalObject(result.final) ?? result.final;
    return this.toStageResponse(state.sessionId, CheckInState.BEGIN_CONVERSATION, payload, result.steps);
  }

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

  toStageResponse(
    sessionId: string,
    stage: CheckInState,
    payload: unknown,
    steps: unknown,
  ): StageResponse {
    const base = this.normalizeBaseState(payload);
    return {
      sessionId,
      stage,
      steps,
      ...(payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}),
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
}

export type StageResponse = BaseState & {
  sessionId: string;
  stage: CheckInState;
  steps?: unknown;
};

const isStageStatus = (value: unknown): value is StageStatus =>
  value === STAGE_STATUS.NOT_STARTED ||
  value === STAGE_STATUS.IN_PROGRESS ||
  value === STAGE_STATUS.SUCCESS ||
  value === STAGE_STATUS.FAILED ||
  value === STAGE_STATUS.USER_INPUT_REQUIRED;
