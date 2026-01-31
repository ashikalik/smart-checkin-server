import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AiAgentModule } from '../ai-agent/ai-agent.module';
import { OpenAiChatModelModule } from '../open-ai-chat-model/open-ai-chat-model.module';
import { MainOrchestratorController } from './main-orchestrator.controller';
import { MainOrchestratorHelperService } from './main-orchestrator-helper.service';
import { MainOrchestratorService } from './main-orchestrator.service';
import { MainOrchestratorV1HelperService } from './main-orchestrator-v1-helper.service';
import { MainOrchestratorV1RegistryService } from './main-orchestrator-v1-registry.service';
import { MainOrchestratorV1Service } from './main-orchestrator-v1.service';
import { StateModule } from '../state/state.module';
import { BeginConversationAgentModule } from '../agents/begin-conversation/begin-conversation-agent.module';
import { TripIdentificationAgentModule } from '../agents/trip-identification/trip-identification-agent.module';

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
        mcpServers: resolveMainMcpServers(configService),
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
    StateModule,
    BeginConversationAgentModule,
    TripIdentificationAgentModule,
  ],
  controllers: [MainOrchestratorController],
  providers: [
    MainOrchestratorService,
    MainOrchestratorHelperService,
    MainOrchestratorV1Service,
    MainOrchestratorV1HelperService,
    MainOrchestratorV1RegistryService,
  ],
  exports: [MainOrchestratorService, MainOrchestratorV1Service],
})
export class MainOrchestratorModule {}

const parseNumber = (value?: string): number | undefined => {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const resolveMainMcpServers = (configService: ConfigService) => {
  const list = configService.get<string>('MAIN_ORCHESTRATOR_MCP_SERVER_URLS');
  if (list) {
    try {
      const parsed = JSON.parse(list) as Array<{
        url?: string;
        name?: string;
        toolNamePrefix?: string;
        transport?: 'http' | 'stdio';
        command?: string;
        args?: string[];
        env?: Record<string, string>;
        cwd?: string;
        stderr?: 'inherit' | 'pipe' | 'overlapped';
      }>;
      const servers = parsed
        .filter((item) => typeof item?.url === 'string' || item?.transport === 'stdio')
        .map((item, index) => ({
          url: item.url,
          name: item.name ?? `main-orchestrator-mcp-${index + 1}`,
          toolNamePrefix: item.toolNamePrefix,
          transport: item.transport,
          command: item.command,
          args: item.args,
          env: item.env,
          cwd: item.cwd,
          stderr: item.stderr,
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
          name: `main-orchestrator-mcp-${index + 1}`,
        }));
      if (servers.length > 0) {
        return servers;
      }
    }
  }

  const single = configService.get<string>('MAIN_ORCHESTRATOR_MCP_SERVER_URL');
  if (single) {
    return [{ url: single, name: 'mcp-checkin' }];
  }

  return [];
};
