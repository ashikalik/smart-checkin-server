import { Body, Controller, Post } from '@nestjs/common';
import { MainOrchestratorService } from './main-orchestrator.service';

type RunRequest = {
  goal: string;
  sessionId?: string;
};

@Controller('main')
export class MainOrchestratorController {
  constructor(private readonly orchestrator: MainOrchestratorService) {}

  @Post('run')
  async run(@Body() body: RunRequest) {
    return this.orchestrator.run(body.goal, body.sessionId);
  }
}
