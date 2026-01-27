import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
 
import { McpCheckInController } from './checkin-mcp.controller';
import { McpCheckInService } from './checkin-mcp.service';
import { SsciJourneyIdentificationService } from './tools/retrieve-journey.tool';
import { SsciRetrieveOrderGqlService } from './tools/retrieve-order.tool';
import { SsciProcessCheckinService } from './auto-checkin-tools/process-acceptance.tool';
import { SsciRegulatoryDetailsService } from './auto-checkin-tools/regulatory-get.tool';
import { SsciRegulatoryDetailsUpdateService } from './auto-checkin-tools/regulatory-update.tool';
import { SsciRegulatoryContactService } from './auto-checkin-tools/regulatory-contact.service';
 
@Module({
  imports: [HttpModule], 
  controllers: [McpCheckInController],
  providers: [
    McpCheckInService,
    SsciJourneyIdentificationService,
    SsciRetrieveOrderGqlService,
    SsciProcessCheckinService,
    SsciRegulatoryDetailsService,
    SsciRegulatoryDetailsUpdateService,
    SsciRegulatoryContactService
  ],
})
export class McpCheckInModule {}