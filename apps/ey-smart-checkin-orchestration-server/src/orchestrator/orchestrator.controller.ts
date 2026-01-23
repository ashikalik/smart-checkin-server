import { Body, Controller, Get, Post } from '@nestjs/common';
import { OrchestratorService } from './orchestrator.service';

type RunRequest = {
  goal: string;
};

@Controller('orchestrator')
export class OrchestratorController {
  constructor(private readonly orchestrator: OrchestratorService) {}

  @Get('tools')
  listTools() {
    return this.orchestrator.listTools();
  }

  @Post('run')
  run(@Body() body: RunRequest) {
    return this.orchestrator.runAgentLoop(body.goal);
  }

  @Post('agent-run')
  runAgent(@Body() body: RunRequest) {
    return this.orchestrator.runAgentLoop(body.goal);
  }
}
