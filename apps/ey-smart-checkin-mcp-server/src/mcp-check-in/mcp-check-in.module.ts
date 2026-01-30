import { Module } from '@nestjs/common';
import { TripIdentificationModule } from './trip-identification/trip-identification.module';
import { JourneyIdentificationMcpModule } from './journey-identification/journey-identification.module';
import { ValidateProcesscheckinModule } from './process-check-in/process-check-in.module';

@Module({
  imports: [TripIdentificationModule, JourneyIdentificationMcpModule, ValidateProcesscheckinModule],
  exports: [TripIdentificationModule, JourneyIdentificationMcpModule, ValidateProcesscheckinModule],
})
export class McpCheckInModule {}
