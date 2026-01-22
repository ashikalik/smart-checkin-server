import { Module } from '@nestjs/common';
import { McpService } from './mcp.service';
import { MathService } from './services/math.service';
import { SaveResultService } from './services/save-result.service';
import { McpController } from './mcp.controller';

@Module({
  controllers: [McpController],
  providers: [McpService, MathService, SaveResultService],
})
export class McpModule {}
