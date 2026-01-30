import { Module } from '@nestjs/common';
import { TripIdentificationModule } from './trip-identification/trip-identification.module';

@Module({
  imports: [TripIdentificationModule],
  exports: [TripIdentificationModule],
})
export class McpCheckInStatesModule {}
