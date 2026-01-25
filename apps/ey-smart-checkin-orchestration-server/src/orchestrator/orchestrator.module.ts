import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AiAgentModule } from '../ai-agent/ai-agent.module';
import { resolveMcpServers } from '../ai-agent/ai-agent.service';
import { OpenAiChatModelModule } from '../open-ai-chat-model/open-ai-chat-model.module';
import { OrchestratorController } from './orchestrator.controller';
import { OrchestratorService } from './orchestrator.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'apps/ey-smart-checkin-orchestration-server/.env',
    }),
    OpenAiChatModelModule.registerAsync(),
    AiAgentModule.forFeatureAsync({
      imports: [ConfigModule, OpenAiChatModelModule.registerAsync()],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        mcpServers: resolveMcpServers(configService),
        systemPrompt: configService.get<string>('AI_AGENT_SYSTEM_PROMPT'),
        maxModelCalls: parseNumber(configService.get<string>('AI_AGENT_MAX_CALLS')),
        continuePrompt: configService.get<string>('AI_AGENT_CONTINUE_PROMPT'),
        computedNotesTemplate: configService.get<string>('AI_AGENT_COMPUTED_NOTES_TEMPLATE'),
        defaultClientName: configService.get<string>('MCP_CLIENT_NAME'),
        defaultClientVersion: configService.get<string>('MCP_CLIENT_VERSION'),
        toolCollisionStrategy: (configService.get<string>('AI_AGENT_TOOL_COLLISION_STRATEGY') as
          | 'namespace'
          | 'skip'
          | 'error'
          | undefined),
        toolNamespaceSeparator: configService.get<string>('AI_AGENT_TOOL_NAMESPACE_SEPARATOR'),
        toolNamespaceKey: (configService.get<string>('AI_AGENT_TOOL_NAMESPACE_KEY') as 'name' | 'url' | undefined),
      }),
    }),
  ],
  controllers: [OrchestratorController],
  providers: [OrchestratorService],
})
export class OrchestratorModule {}

const parseNumber = (value?: string): number | undefined => {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
