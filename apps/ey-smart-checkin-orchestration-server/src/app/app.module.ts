import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ArithmeticOrchestratorModule } from '../arithmetic-orchestrator/arithmetic-orchestrator.module';
import { IdentificationOrchestratorModule } from '../identification-orchestrator/identification-orchestrator.module';
import { FfpBookingOrchestratorModule } from '../ffp-booking-orchestrator/ffp-booking-orchestrator.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'apps/ey-smart-checkin-orchestration-server/.env',
    }),
    ArithmeticOrchestratorModule,
    IdentificationOrchestratorModule,
    FfpBookingOrchestratorModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
