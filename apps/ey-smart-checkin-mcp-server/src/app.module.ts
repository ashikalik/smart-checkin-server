import { Module } from '@nestjs/common';
import { McpModule } from './mcp/mcp.module';
import { McpCheckInStatesModule } from './mcp-check-in/mcp-check-in.module';
import { McpCheckInModule } from './mcp-checkin/checkin-mcp.module';

@Module({
  imports: [McpModule, McpCheckInModule, McpCheckInStatesModule],
})
export class AppModule {}
