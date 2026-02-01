import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TripIdentificationAgentModule } from '../agents/trip-identification/trip-identification-agent.module';
import { BeginConversationAgentModule } from '../agents/begin-conversation/begin-conversation-agent.module';
import { JourneyIdentificationAgentModule } from '../agents/journey-identification/journey-identification-agent.module';
import { ValidateProcessCheckInAgentModule } from '../agents/validate-process-checkin/validate-process-checkin-agent.module';
import { CheckinAcceptanceAgentModule } from '../agents/checkin-acceptance/checkin-acceptance-agent.module';
import { BoardingPassAgentModule } from '../agents/boarding-pass/boarding-pass-agent.module';
import { RegulatoryDetailsAgentModule } from '../agents/regulatory-details/regulatory-details-agent.module';
import { MainOrchestratorModule } from '../main-orchestrator/main-orchestrator.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'apps/ey-smart-checkin-orchestration-server/.env',
    }),

    BeginConversationAgentModule,
    TripIdentificationAgentModule,
    JourneyIdentificationAgentModule,
    ValidateProcessCheckInAgentModule,
    CheckinAcceptanceAgentModule,
    BoardingPassAgentModule,
    RegulatoryDetailsAgentModule,
    MainOrchestratorModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
