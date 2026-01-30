import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { BeginConversationAgentService } from '../agents/begin-conversation/begin-conversation-agent.service';
import { TripIdentificationAgentService } from '../agents/trip-identification/trip-identification-agent.service';
import { StateService } from '../state/state.service';
import { CheckInState } from '../shared/checkin-state.enum';
import { STAGE_STATUS } from '../shared/stage-status.type';
import { MainOrchestratorV1HelperService } from './main-orchestrator-v1-helper.service';

@Injectable()
export class MainOrchestratorV1Service {
  constructor(
    private readonly helper: MainOrchestratorV1HelperService,
    private readonly stateService: StateService,
    private readonly beginConversation: BeginConversationAgentService,
    private readonly tripIdentification: TripIdentificationAgentService,
  ) {}

  async run(goal: string, sessionId?: string): Promise<Record<string, unknown>> {
    const currentSessionId = sessionId ?? uuidv4();
    const state =
      (await this.stateService.getState(currentSessionId)) ?? this.helper.buildInitialState(currentSessionId);

    if (!sessionId || !state?.data) {
      await this.stateService.saveState(currentSessionId, state);
      return {
        sessionId: currentSessionId,
        stage: CheckInState.BEGIN_CONVERSATION,
        status: STAGE_STATUS.USER_INPUT_REQUIRED,
        continue: false,
        updatedAtUtc: new Date().toISOString(),
        userMessage: 'Please provide your frequent flyer number or booking reference, plus your last name.',
      };
    }

    const data = (state.data ?? {}) as Record<string, unknown>;
    const currentStage = this.helper.getCurrentStage(data);

    switch (currentStage) {
      case CheckInState.BEGIN_CONVERSATION: {
        const result = await this.helper.runBeginConversation(state, goal, this.beginConversation);
        if (result.status === STAGE_STATUS.SUCCESS && result.continue === true) {
          return this.helper.advanceToTripIdentification(state, goal, this.tripIdentification, this.stateService);
        }
        return result;
      }
      case CheckInState.TRIP_IDENTIFICATION:
        return this.helper.runTripIdentification(state, goal, this.tripIdentification);
      default:
        return {
          sessionId: currentSessionId,
          stage: currentStage,
          status: STAGE_STATUS.FAILED,
          continue: false,
          updatedAtUtc: new Date().toISOString(),
          userMessage: `No orchestrator configured for stage ${currentStage}.`,
        };
    }
  }
}
