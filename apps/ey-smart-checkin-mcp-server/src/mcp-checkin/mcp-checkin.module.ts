import { Module } from '@nestjs/common';
import { McpCheckinController } from './mcp-checkin.controller';
import { McpCheckinService } from './mcp-checkin.service';
import { FfpBookingService } from './services/ffp-booking.service';
import { JourneyService } from './services/journey.service';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [McpCheckinController],
  providers: [McpCheckinService, JourneyService, FfpBookingService],
})
export class McpCheckinModule {}
