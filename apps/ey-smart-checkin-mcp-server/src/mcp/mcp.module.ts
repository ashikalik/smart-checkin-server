import { Module } from '@nestjs/common';
import { McpService } from './mcp.service';
import { MathService } from './services/math.service';
import { SaveResultService } from './services/save-result.service';

@Module({
  providers: [McpService, MathService, SaveResultService],
})
export class McpModule {}
