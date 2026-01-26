import { Module } from '@nestjs/common';
import { McpCheckinController } from './mcp-checkin.controller';
import { McpCheckinService } from './mcp-checkin.service';
import { JourneyService } from './services/journey.service';

@Module({
  controllers: [McpCheckinController],
  providers: [McpCheckinService, JourneyService],
})
export class McpCheckinModule {}
