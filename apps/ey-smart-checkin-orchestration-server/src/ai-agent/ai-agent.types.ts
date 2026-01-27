export type McpServerConfig = {
  url?: string;
  transport?: 'http' | 'stdio';
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  stderr?: 'inherit' | 'pipe' | 'overlapped';
  name?: string;
  toolNamePrefix?: string;
  clientName?: string;
  clientVersion?: string;
};

export type AiAgentConfig = {
  mcpServers: McpServerConfig[];
  systemPrompt?: string;
  maxModelCalls?: number;
  continuePrompt?: string;
  computedNotesTemplate?: string;
  defaultClientName?: string;
  defaultClientVersion?: string;
  toolCollisionStrategy?: 'namespace' | 'skip' | 'error';
  toolNamespaceSeparator?: string;
  toolNamespaceKey?: 'name' | 'url';
};

export const AI_AGENT_CONFIG = Symbol('AI_AGENT_CONFIG');

export type AiAgentStep = {
  action: string;
  tool?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  error?: string;
};

export type AiAgentRunOptions = {
  systemPrompt?: string;
  continuePrompt?: string;
  computedNotesTemplate?: string;
  maxModelCalls?: number;
  enforceToolUse?: boolean;
  toolUsePrompt?: string;
  toolChoice?: 'required' | 'auto';
  maxToolEnforcementRetries?: number;
  enforceNumbersFromGoal?: boolean;
  maxInvalidToolArgs?: number;
  allowedTools?: string[];
  blockedTools?: string[];
};
