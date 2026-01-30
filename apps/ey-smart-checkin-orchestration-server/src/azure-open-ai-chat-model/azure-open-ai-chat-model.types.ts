export type AzureOpenAiChatModelConfig = {
  apiKey?: string;
  endpoint?: string;
  deployment?: string;
  apiVersion?: string;
  model?: string;
  logRequests?: boolean;
};

export const AZURE_OPEN_AI_CHAT_MODEL_CONFIG = Symbol('AZURE_OPEN_AI_CHAT_MODEL_CONFIG');

export type AzureOpenAiChatResponse = {
  id?: string;
  output?: Array<Record<string, unknown>>;
  output_text?: string;
  choices?: Array<{ message?: { content?: string; tool_calls?: Array<Record<string, unknown>> } }>;
  error?: unknown;
  status?: number | string;
};
