import { Body, Controller, Post } from '@nestjs/common';
import { MainOrchestratorV1Service } from './main-orchestrator-v1.service';

type RunRequest = {
  goal: string;
  sessionId?: string;
};

@Controller('main')
export class MainOrchestratorController {
  constructor(private readonly orchestrator: MainOrchestratorV1Service) {}

  @Post('run')
  async run(@Body() body: RunRequest) {
    return this.orchestrator.run(body.goal, body.sessionId);
  }
}
