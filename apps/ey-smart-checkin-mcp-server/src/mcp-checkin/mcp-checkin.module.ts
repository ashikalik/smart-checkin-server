import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { FfpBookingMockController } from './controllers/ffp-booking-mock.controller';
import { McpCheckinController } from './mcp-checkin.controller';
import { McpCheckinService } from './mcp-checkin.service';
import { FfpBookingService } from './services/ffp-booking.service';
import { TripIdentificationModule } from '../mcp-check-in/trip-identification/trip-identification.module';
import { JourneyService } from './services/journey.service';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule, HttpModule, TripIdentificationModule],
  controllers: [McpCheckinController, FfpBookingMockController],
  providers: [McpCheckinService, JourneyService, FfpBookingService],
})
export class McpCheckinModule {}
