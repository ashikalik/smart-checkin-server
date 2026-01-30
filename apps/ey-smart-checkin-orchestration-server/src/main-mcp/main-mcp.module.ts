import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OpenAiChatModelModule } from '../open-ai-chat-model/open-ai-chat-model.module';
import { IdentificationOrchestratorModule } from '../identification-orchestrator/identification-orchestrator.module';
import { FfpBookingOrchestratorModule } from '../ffp-booking-orchestrator/ffp-booking-orchestrator.module';
import { MainMcpService } from './main-mcp.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'apps/ey-smart-checkin-orchestration-server/.env',
    }),
    OpenAiChatModelModule.registerAsync(),
    IdentificationOrchestratorModule,
    FfpBookingOrchestratorModule,
  ],
  providers: [MainMcpService],
  exports: [MainMcpService],
})
export class MainMcpModule {}
