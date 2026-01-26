import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { OpenAiChatModelService } from './open-ai-chat-model.service';
import { OPEN_AI_CHAT_MODEL_CONFIG, OpenAiChatModelConfig } from './open-ai-chat-model.types';

@Module({})
export class OpenAiChatModelModule {
  static register(config: OpenAiChatModelConfig): DynamicModule {
    return {
      module: OpenAiChatModelModule,
      providers: [
        {
          provide: OPEN_AI_CHAT_MODEL_CONFIG,
          useValue: config,
        },
        OpenAiChatModelService,
      ],
      exports: [OpenAiChatModelService],
    };
  }

  static registerAsync(overrides?: Partial<OpenAiChatModelConfig>): DynamicModule {
    return {
      module: OpenAiChatModelModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: OPEN_AI_CHAT_MODEL_CONFIG,
          inject: [ConfigService],
          useFactory: (configService: ConfigService): OpenAiChatModelConfig => ({
            apiKey: overrides?.apiKey ?? configService.get<string>('OPENAI_API_KEY'),
            model: overrides?.model ?? configService.get<string>('OPENAI_MODEL'),
            baseUrl: overrides?.baseUrl ?? configService.get<string>('OPENAI_BASE_URL'),
            instructions: overrides?.instructions ?? configService.get<string>('OPENAI_DEFAULT_INSTRUCTIONS'),
            logRequests:
              overrides?.logRequests ??
              (configService.get<string>('OPENAI_LOG_REQUESTS')
                ? configService.get<string>('OPENAI_LOG_REQUESTS') === 'true'
                : undefined),
          }),
        },
        OpenAiChatModelService,
      ],
      exports: [OpenAiChatModelService],
    };
  }
}
