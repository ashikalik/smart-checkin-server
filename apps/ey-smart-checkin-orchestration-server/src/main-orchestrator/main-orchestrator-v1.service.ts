import { Injectable } from '@nestjs/common';
import { MainOrchestratorV1HelperService } from './main-orchestrator-v1-helper.service';
import { StageResponse } from '../shared/stage-response.type';
import { MainOrchestratorV1RegistryService } from './main-orchestrator-v1-registry.service';
import { StateHelperService } from '../shared/state-helper.service';

@Injectable()
export class MainOrchestratorV1Service {
  constructor(
    private readonly helper: MainOrchestratorV1HelperService,
    private readonly stateHelper: StateHelperService,
    private readonly registry: MainOrchestratorV1RegistryService,
  ) {}

  async run(goal: string, sessionId?: string): Promise<StageResponse> {
    
    const resolved = await this.helper.resolveSession(sessionId);
    if (resolved.response) {
      return resolved.response;
    }
    const currentSessionId = resolved.sessionId;
    const state = resolved.state;

    const currentStage = this.helper.getCurrentStage(state);
    const handler = this.registry.getHandler(currentStage);
    if (handler) {
      return handler(state, goal);
    }

    return this.stateHelper.buildUnknownStageResponse(currentSessionId, currentStage);
  }
}
