import { Module } from '@nestjs/common';
//import { McpModule } from './mcp/mcp.module';
import { McpCheckInModule } from './mcp-checkin/checkin-mcp.module';

@Module({
  imports: [McpCheckInModule],
})
export class AppModule {}
