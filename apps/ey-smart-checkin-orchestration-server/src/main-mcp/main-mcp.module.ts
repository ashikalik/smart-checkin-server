import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AzureOpenAiChatModelModule } from '../azure-open-ai-chat-model/azure-open-ai-chat-model.module';
import { IdentificationOrchestratorModule } from '../identification-orchestrator/identification-orchestrator.module';
import { FfpBookingOrchestratorModule } from '../ffp-booking-orchestrator/ffp-booking-orchestrator.module';
import { ArithmeticOrchestratorModule } from '../arithmetic-orchestrator/arithmetic-orchestrator.module';
import { MainMcpService } from './main-mcp.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'apps/ey-smart-checkin-orchestration-server/.env',
    }),
    AzureOpenAiChatModelModule.registerAsync(),
    IdentificationOrchestratorModule,
    FfpBookingOrchestratorModule,
    ArithmeticOrchestratorModule,
  ],
  providers: [MainMcpService],
  exports: [MainMcpService],
})
export class MainMcpModule {}
