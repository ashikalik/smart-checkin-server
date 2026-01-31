import { Module } from '@nestjs/common';
import { TripIdentificationModule } from './trip-identification/trip-identification.module';
import { JourneyIdentificationMcpModule } from './journey-identification/journey-identification.module';
import { ValidateProcesscheckinModule } from './process-check-in/process-check-in.module';
import { CheckinAcceptanceModule } from './check-in-acceptance/checkin-acceptance.module';
import { BoardingPassModule } from './boarding-pass/boarding-pass.module';

@Module({
  imports: [
    TripIdentificationModule,
    JourneyIdentificationMcpModule,
    ValidateProcesscheckinModule,
    CheckinAcceptanceModule,
    BoardingPassModule,
  ],
  exports: [
    TripIdentificationModule,
    JourneyIdentificationMcpModule,
    ValidateProcesscheckinModule,
    CheckinAcceptanceModule,
    BoardingPassModule,
  ],
})
export class McpCheckInModule {}
