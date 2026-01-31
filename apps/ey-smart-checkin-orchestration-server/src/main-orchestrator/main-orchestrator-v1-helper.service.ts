import { Injectable } from '@nestjs/common';
import { BeginConversationAgentService } from '../agents/begin-conversation/begin-conversation-agent.service';
import { CheckInState } from '../shared/checkin-state.enum';
import { OrchestratorState } from '../state/state-store.interface';
import { TripIdentificationAgentService } from '../agents/trip-identification/trip-identification-agent.service';
import { StageResponse } from '../shared/stage-response.type';
import { StateHelperService } from '../shared/state-helper.service';

@Injectable()
export class MainOrchestratorV1HelperService {
  constructor(
    private readonly stateHelper: StateHelperService,
    private readonly beginConversation: BeginConversationAgentService,
    private readonly tripIdentification: TripIdentificationAgentService,
  ) { }
  buildInitialState(sessionId: string): OrchestratorState {
    return this.stateHelper.buildInitialState(sessionId);
  }

  getCurrentStage(state: OrchestratorState): CheckInState {
    return this.stateHelper.getCurrentStage(state);
  }

  

  async runBeginConversation(
    state: OrchestratorState,
    goal: string,
  ): Promise<StageResponse> {
    const response = await this.beginConversation.handleStage(state.sessionId, goal);
    if (state.beginConversation && response) {
      const merged = this.beginConversation.updateBeginConversationState(
        state.beginConversation,
        response as unknown as Partial<import('../shared/begin-conversation-state').BeginConversationState>,
      );
      const nextState: OrchestratorState = {
        ...state,
        beginConversation: merged,
      };
      await this.stateHelper.stateService.saveState(state.sessionId, nextState);
      return {
        ...response,
        ...merged,
        sessionId: state.sessionId,
        stage: response.stage,
        steps: response.steps,
      };
    }
    return response;
  }

  async runTripIdentification(
    state: OrchestratorState,
    goal: string,
  ): Promise<StageResponse> {
    return this.tripIdentification.handleStage(state.sessionId, goal);
  }

  resolveSession(
    sessionId: string | undefined,
  ): Promise<{ sessionId: string; state: OrchestratorState; response?: StageResponse }> {
    return this.stateHelper.resolveSession(sessionId);
  }

  async navigate(
    state: OrchestratorState,
    goal: string,
    nextStage: CheckInState,
  ): Promise<StageResponse> {
    const nextState: OrchestratorState = {
      ...state,
      currentStage: nextStage,
    };
    await this.stateHelper.stateService.saveState(state.sessionId, nextState);
    switch (nextStage) {
      case CheckInState.BEGIN_CONVERSATION:
        return this.runBeginConversation(nextState, goal);
      case CheckInState.TRIP_IDENTIFICATION:
        return this.runTripIdentification(nextState, goal);
      default:
        return this.stateHelper.buildUnknownStageResponse(state.sessionId, nextStage);
    }
  }

}
