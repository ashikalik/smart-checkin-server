import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

import { BoardingPassController } from './controller/boarding-pass.controller';
import { BoardingPassToolsService } from './services/boarding-pass.tools-service';
import { BoardingPassService } from './services/ssci-boarding-pass.service';

@Module({
  imports: [HttpModule],
  controllers: [BoardingPassController],
  providers: [BoardingPassService, BoardingPassToolsService],
  exports: [BoardingPassService],
})
export class BoardingPassModule {}
