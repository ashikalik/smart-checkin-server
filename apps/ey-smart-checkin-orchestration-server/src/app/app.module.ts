import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
// import { ArithmeticOrchestratorModule } from '../arithmetic-orchestrator/arithmetic-orchestrator.module';
// import { IdentificationOrchestratorModule } from '../identification-orchestrator/identification-orchestrator.module';
// import { FfpBookingOrchestratorModule } from '../ffp-booking-orchestrator/ffp-booking-orchestrator.module';
// import { MainOrchestratorModule } from '../main-orchestrator/main-orchestrator.module';
import { TripIdentificationAgentModule } from '../agents/trip-identification/trip-identification-agent.module';
import { JourneyIdentificationAgentModule } from '../agents/journey-identification/journey-identification-agent.module';
import { ValidateProcessCheckInAgentModule } from '../agents/validate-process-checkin/validate-process-checkin-agent.module';
import { CheckinAcceptanceAgentModule } from '../agents/checkin-acceptance/checkin-acceptance-agent.module';
import { BoardingPassAgentModule } from '../agents/boarding-pass/boarding-pass-agent.module';
// import { AutoCheckInOrchestratorModule } from '../auto-checkin-orchestrator/auto-checkin-orchestrator.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'apps/ey-smart-checkin-orchestration-server/.env',
    }),
    // ArithmeticOrchestratorModule,
    // IdentificationOrchestratorModule,
    // FfpBookingOrchestratorModule,
    TripIdentificationAgentModule,
    JourneyIdentificationAgentModule,
    ValidateProcessCheckInAgentModule,
    CheckinAcceptanceAgentModule,
    BoardingPassAgentModule,
    // MainOrchestratorModule,
    // AutoCheckInOrchestratorModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
