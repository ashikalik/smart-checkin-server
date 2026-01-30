import { Module } from '@nestjs/common';
import { McpService } from './mcp.service';
import { MathService } from './services/math.service';
import { SaveResultService } from './services/save-result.service';
import { McpController } from './mcp.controller';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [SharedModule],
  controllers: [McpController],
  providers: [McpService, MathService, SaveResultService],
})
export class McpModule {}
