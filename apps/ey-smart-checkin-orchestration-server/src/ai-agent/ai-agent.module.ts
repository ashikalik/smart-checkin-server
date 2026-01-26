import { DynamicModule, Module } from '@nestjs/common';
import { InjectionToken } from '@nestjs/common/interfaces/modules/injection-token.interface';
import { AiAgentService } from './ai-agent.service';
import { AI_AGENT_CONFIG, AiAgentConfig } from './ai-agent.types';

export type AiAgentModuleAsyncOptions = {
  imports?: DynamicModule['imports'];
  inject?: Array<InjectionToken>;
  useFactory: (...args: Array<unknown>) => AiAgentConfig;
};

@Module({})
export class AiAgentModule {
  static forFeature(config: AiAgentConfig): DynamicModule {
    return {
      module: AiAgentModule,
      providers: [
        {
          provide: AI_AGENT_CONFIG,
          useValue: config,
        },
        AiAgentService,
      ],
      exports: [AiAgentService],
    };
  }

  static forFeatureAsync(options: AiAgentModuleAsyncOptions): DynamicModule {
    return {
      module: AiAgentModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: AI_AGENT_CONFIG,
          inject: options.inject ?? [],
          useFactory: options.useFactory,
        },
        AiAgentService,
      ],
      exports: [AiAgentService],
    };
  }
}
