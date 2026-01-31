import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AiAgentModule } from '../../ai-agent/ai-agent.module';
import { OpenAiChatModelModule } from '../../open-ai-chat-model/open-ai-chat-model.module';
import { OutputFormatterModule } from '../../output-formatter/output-formatter.module';
import { StateModule } from '../../state/state.module';
import { CheckinAcceptanceAgentController } from './checkin-acceptance-agent.controller';
import { CheckinAcceptanceAgentService } from './checkin-acceptance-agent.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'apps/ey-smart-checkin-orchestration-server/.env',
    }),
    OpenAiChatModelModule.registerAsync(),
    OutputFormatterModule,
    StateModule,
    AiAgentModule.forFeatureAsync({
      imports: [ConfigModule, OpenAiChatModelModule.registerAsync()],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        mcpServers: resolveCheckinAcceptanceMcpServers(configService),
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
  controllers: [CheckinAcceptanceAgentController],
  providers: [CheckinAcceptanceAgentService],
  exports: [CheckinAcceptanceAgentService],
})
export class CheckinAcceptanceAgentModule {}

const parseNumber = (value?: string): number | undefined => {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const resolveCheckinAcceptanceMcpServers = (configService: ConfigService) => {
  const list = configService.get<string>('CHECKIN_ACCEPTANCE_MCP_SERVER_URLS');
  if (list) {
    try {
      const parsed = JSON.parse(list) as Array<{ url?: string; name?: string; toolNamePrefix?: string }>;
      const servers = parsed
        .filter((item) => typeof item?.url === 'string')
        .map((item, index) => ({
          url: item.url as string,
          name: item.name ?? `checkin-acceptance-mcp-${index + 1}`,
          toolNamePrefix: item.toolNamePrefix,
        }));
      if (servers.length > 0) {
        return servers;
      }
    } catch {
      const servers = list
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((url, index) => ({
          url,
          name: `checkin-acceptance-mcp-${index + 1}`,
        }));
      if (servers.length > 0) {
        return servers;
      }
    }
  }

  const single = configService.get<string>('CHECKIN_ACCEPTANCE_MCP_SERVER_URL');
  if (single) {
    return [{ url: single, name: 'mcp-checkin-acceptance' }];
  }

  return [];
};
