import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
 
import { McpCheckInController } from './checkin-mcp.controller';
import { McpCheckInService } from './checkin-mcp.service';
import { SsciJourneyIdentificationService } from './tools/retrieve-journey.tool';
import { SsciRetrieveOrderGqlService } from './tools/retrieve-order.tool';
 
@Module({
  imports: [HttpModule], 
  controllers: [McpCheckInController],
  providers: [
    McpCheckInService,
    SsciJourneyIdentificationService,
    SsciRetrieveOrderGqlService,
  ],
})
export class McpCheckInModule {}