
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { JourneyIdentificationController } from './controller/journey-identification.controller';
import { SsciJourneyIdentificationService } from './services/journey-identification.service';
import { JourneyIdentificationToolsService } from './services/journey-identification.tools-services';
import { SsciRetrieveOrderGqlService } from './tools/retrieve-order.tool';


@Module({
  imports: [HttpModule],
  controllers: [JourneyIdentificationController],
  providers: [SsciJourneyIdentificationService, JourneyIdentificationToolsService, SsciRetrieveOrderGqlService],
  exports: [SsciJourneyIdentificationService, JourneyIdentificationToolsService, SsciRetrieveOrderGqlService],
})
export class JourneyIdentificationMcpModule {}