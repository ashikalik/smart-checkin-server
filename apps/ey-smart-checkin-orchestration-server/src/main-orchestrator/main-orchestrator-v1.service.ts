import { Injectable } from '@nestjs/common';
import { MainOrchestratorV1HelperService } from './main-orchestrator-v1-helper.service';

@Injectable()
export class MainOrchestratorV1Service {
  constructor(private readonly helper: MainOrchestratorV1HelperService) {}

  async run(_goal: string, _sessionId?: string): Promise<Record<string, unknown>> {
    return {};
  }
}
