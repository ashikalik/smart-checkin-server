import { Module } from '@nestjs/common';
import { McpCheckInModule } from './mcp-check-in/mcp-check-in.module';
import { MocksController } from './mocks/mock.controller';

@Module({
  imports: [McpCheckInModule],
  controllers:[MocksController]
})
export class AppModule {}
