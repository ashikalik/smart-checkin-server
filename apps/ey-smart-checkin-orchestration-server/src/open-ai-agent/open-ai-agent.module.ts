import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OpenAiAgentService } from './open-ai-agent.service';
import { OPEN_AI_AGENT_CONFIG, OpenAiAgentConfig } from './open-ai-agent.types';

@Module({})
export class OpenAiAgentModule {
  static register(config: OpenAiAgentConfig): DynamicModule {
    return {
      module: OpenAiAgentModule,
      providers: [
        {
          provide: OPEN_AI_AGENT_CONFIG,
          useValue: config,
        },
        OpenAiAgentService,
      ],
      exports: [OpenAiAgentService],
    };
  }

  static registerAsync(): DynamicModule {
    return {
      module: OpenAiAgentModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: OPEN_AI_AGENT_CONFIG,
          inject: [ConfigService],
          useFactory: (configService: ConfigService): OpenAiAgentConfig => ({
            apiKey: configService.get<string>('OPENAI_API_KEY'),
            model: configService.get<string>('OPENAI_MODEL'),
            baseUrl: configService.get<string>('OPENAI_BASE_URL'),
          }),
        },
        OpenAiAgentService,
      ],
      exports: [OpenAiAgentService],
    };
  }
}
