import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

import { RegulatoryDetailsController } from './controller/regulatory-details.controller';
import { RegulatoryDetailsToolsService } from './services/regulatory-details.tools-service';
import { RegulatoryDetailsService } from './services/ssci-regulatory-details.service';

@Module({
  imports: [HttpModule],
  controllers: [RegulatoryDetailsController],
  providers: [RegulatoryDetailsService, RegulatoryDetailsToolsService],
  exports: [RegulatoryDetailsService],
})
export class RegulatoryDetailsModule {}
