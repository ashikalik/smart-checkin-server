// apps/ey-smart-checkin-mcp-server/src/mcp-checkin/validate-processcheckin/validate-processcheckin.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

import { ValidateProcessCheckinController } from './controller/validate-process-checkin.controller';
import { ValidateProcessCheckInToolsService } from './services/validate-process-checkin.tools-service';
import { ValidateProcessCheckinService } from './services/ssci-process-checkin.service';

@Module({
  imports: [HttpModule],
  controllers: [ValidateProcessCheckinController],
  providers: [ValidateProcessCheckinService, ValidateProcessCheckInToolsService],
  exports: [ValidateProcessCheckinService],
})
export class ValidateProcesscheckinModule {}
