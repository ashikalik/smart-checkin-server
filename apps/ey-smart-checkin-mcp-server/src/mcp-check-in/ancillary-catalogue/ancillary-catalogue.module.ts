import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

import { AncillaryCatalogueController } from './controller/ancillary-catalogue.controller';
import { AncillaryCatalogueToolsService } from './services/ancillary-catalogue.tools-service';
import { AncillaryCatalogueService } from './services/ssci-ancillary-catalogue.service';

@Module({
  imports: [HttpModule],
  controllers: [AncillaryCatalogueController],
  providers: [AncillaryCatalogueService, AncillaryCatalogueToolsService],
  exports: [AncillaryCatalogueService],
})
export class AncillaryCatalogueModule {}
