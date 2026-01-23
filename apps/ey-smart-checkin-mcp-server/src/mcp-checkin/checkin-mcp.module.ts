import { Module } from '@nestjs/common';
import { McpCheckInService } from './checkin-mcp.service';
import { McpCheckInController } from './checkin-mcp.controller';

@Module({
  controllers: [McpCheckInController],
  providers: [McpCheckInService]
})
export class McpModule {}
