// apps/ey-smart-checkin-mcp-server/src/mcp-check-in/check-in-acceptance/checkin-acceptance.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

import { CheckinAcceptanceController } from './controller/checkin-acceptance.controller';
import { CheckinAcceptanceToolsService } from './services/checkin-acceptance.tools-service';
import { CheckinAcceptanceService } from './services/ssci-checkin-acceptance.service';

@Module({
  imports: [HttpModule],
  controllers: [CheckinAcceptanceController],
  providers: [CheckinAcceptanceService, CheckinAcceptanceToolsService],
  exports: [CheckinAcceptanceService],
})
export class CheckinAcceptanceModule {}
