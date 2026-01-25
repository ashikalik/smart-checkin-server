import { Module } from '@nestjs/common';
import { OpenAiAgentModule } from '../open-ai-agent/open-ai-agent.module';
import { OrchestratorController } from './orchestrator.controller';
import { OrchestratorService } from './orchestrator.service';

@Module({
  imports: [
    OpenAiAgentModule.registerAsync(),
  ],
  controllers: [OrchestratorController],
  providers: [OrchestratorService],
})
export class OrchestratorModule {}
