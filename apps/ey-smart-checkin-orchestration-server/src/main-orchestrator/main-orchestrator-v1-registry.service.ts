import { Injectable } from '@nestjs/common';
import { CheckInState } from '../shared/checkin-state.enum';
import { SessionState } from '../shared/session-state.interface';
import { MainOrchestratorV1HelperService } from './main-orchestrator-v1-helper.service';
import { StageResponse } from '../shared/stage-response.type';

export type StageHandler = (state: SessionState, goal: string) => Promise<StageResponse>;

@Injectable()
export class MainOrchestratorV1RegistryService {
  private readonly handlers: Partial<Record<CheckInState, StageHandler>>;

  constructor(
    private readonly helper: MainOrchestratorV1HelperService,
  ) {
    this.handlers = {
      [CheckInState.BEGIN_CONVERSATION]: (state, goal) =>
        this.helper.runBeginConversation(state, goal),
      [CheckInState.TRIP_IDENTIFICATION]: (state, goal) =>
        this.helper.runTripIdentification(state, goal),
    };
  }

  getHandler(stage: CheckInState): StageHandler | undefined {
    return this.handlers[stage];
  }
}
