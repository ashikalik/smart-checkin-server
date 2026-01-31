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
  ) {}
  buildInitialState(sessionId: string): OrchestratorState {
    return this.stateHelper.buildInitialState(sessionId);
  }

  getCurrentStage(state: OrchestratorState): CheckInState {
    return this.stateHelper.getCurrentStage(state);
  }

  async advanceToTripIdentification(
    state: OrchestratorState,
    goal: string,
  ): Promise<StageResponse> {
    const nextState: OrchestratorState = {
      ...state,
      currentStage: CheckInState.TRIP_IDENTIFICATION,
    };
    await this.stateHelper.stateService.saveState(state.sessionId, nextState);
    return this.runTripIdentification(nextState, goal);
  }

  async runTripIdentification(
    state: OrchestratorState,
    goal: string,
  ): Promise<StageResponse> {
    return this.tripIdentification.handleStage(state.sessionId, goal);
  }

  async runBeginConversation(
    state: OrchestratorState,
    goal: string,
  ): Promise<StageResponse> {
    return this.beginConversation.handleStage(state.sessionId, goal);
  }



  resolveSession(
    sessionId: string | undefined,
  ): Promise<{ sessionId: string; state: OrchestratorState; response?: StageResponse }> {
    return this.stateHelper.resolveSession(sessionId);
  }


}
