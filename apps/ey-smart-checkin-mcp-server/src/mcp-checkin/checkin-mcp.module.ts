import { Module } from '@nestjs/common';

import { McpCheckInController } from './checkin-mcp.controller';
import { McpCheckInService } from './checkin-mcp.service';

@Module({
  controllers: [McpCheckInController],
  providers: [McpCheckInService]
})
export class McpCheckInModule {}
