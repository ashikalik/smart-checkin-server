import { Module } from '@nestjs/common';
import { McpCheckinModule } from './mcp-checkin/mcp-checkin.module';
import { McpModule } from './mcp/mcp.module';

@Module({
  imports: [McpModule, McpCheckinModule],
})
export class AppModule {}
