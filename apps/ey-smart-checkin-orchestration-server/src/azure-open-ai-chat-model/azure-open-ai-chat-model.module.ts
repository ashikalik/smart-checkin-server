import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AzureOpenAiChatModelService } from './azure-open-ai-chat-model.service';
import {
  AZURE_OPEN_AI_CHAT_MODEL_CONFIG,
  AzureOpenAiChatModelConfig,
} from './azure-open-ai-chat-model.types';

@Module({})
export class AzureOpenAiChatModelModule {
  static register(config: AzureOpenAiChatModelConfig): DynamicModule {
    return {
      module: AzureOpenAiChatModelModule,
      providers: [
        {
          provide: AZURE_OPEN_AI_CHAT_MODEL_CONFIG,
          useValue: config,
        },
        AzureOpenAiChatModelService,
      ],
      exports: [AzureOpenAiChatModelService],
    };
  }

  static registerAsync(overrides?: Partial<AzureOpenAiChatModelConfig>): DynamicModule {
    return {
      module: AzureOpenAiChatModelModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: AZURE_OPEN_AI_CHAT_MODEL_CONFIG,
          inject: [ConfigService],
          useFactory: (configService: ConfigService): AzureOpenAiChatModelConfig => ({
            apiKey: overrides?.apiKey ?? configService.get<string>('AZURE_OPENAI_API_KEY'),
            endpoint: overrides?.endpoint ?? configService.get<string>('AZURE_OPENAI_ENDPOINT'),
            deployment: overrides?.deployment ?? configService.get<string>('AZURE_OPENAI_DEPLOYMENT'),
            apiVersion: overrides?.apiVersion ?? configService.get<string>('AZURE_OPENAI_API_VERSION'),
            model: overrides?.model ?? configService.get<string>('AZURE_OPENAI_MODEL'),
            logRequests:
              overrides?.logRequests ??
              (configService.get<string>('AZURE_OPENAI_LOG_REQUESTS')
                ? configService.get<string>('AZURE_OPENAI_LOG_REQUESTS') === 'true'
                : undefined),
          }),
        },
        AzureOpenAiChatModelService,
      ],
      exports: [AzureOpenAiChatModelService],
    };
  }
}
