import { Body, Controller, Get, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutputFormatterService } from '../../output-formatter/output-formatter.service';
import { OutputFormat } from '../../output-formatter/output-formatter.types';
import { AncillaryCatalogueAgentService } from './ancillary-catalogue-agent.service';

type RunRequest = {
  goal: string;
  format?: OutputFormat;
};

const DEFAULT_OUTPUT_FORMAT: OutputFormat = {
  type: 'json',
  field: 'final',
};

@Controller('ancillary-catalogue')
export class AncillaryCatalogueAgentController {
  constructor(
    private readonly Agent: AncillaryCatalogueAgentService,
    private readonly formatter: OutputFormatterService,
    private readonly configService: ConfigService,
  ) {}

  @Get('tools')
  listTools() {
    return this.Agent.listTools();
  }

  @Post('run')
  async run(@Body() body: RunRequest) {
    const result = await this.Agent.runAgentLoop(body.goal);
    const formatted = this.formatter.format(result, body.format ?? DEFAULT_OUTPUT_FORMAT);
    return this.attachExtrasIfEnabled(formatted, result);
  }

  @Post('agent-run')
  async runAgent(@Body() body: RunRequest) {
    const result = await this.Agent.runAgentLoop(body.goal);
    const formatted = this.formatter.format(result, body.format ?? DEFAULT_OUTPUT_FORMAT);
    return this.attachExtrasIfEnabled(formatted, result);
  }

  private attachExtrasIfEnabled(
    output: unknown,
    result: { goal: string; steps: unknown },
  ): unknown {
    const enableSteps = this.configService.get<string>('ANCILLARY_CATALOGUE_ENABLE_STEPS') === 'true';
    const enableGoal = this.configService.get<string>('ANCILLARY_CATALOGUE_ENABLE_GOAL') === 'true';
    if (!enableSteps && !enableGoal) {
      return output;
    }
    if (!output || typeof output !== 'object') {
      return output;
    }
    const record = output as Record<string, unknown>;
    if (enableSteps) {
      record.steps = result.steps;
    }
    if (enableGoal && record.goal === undefined) {
      record.goal = result.goal;
    }
    return record;
  }
}
