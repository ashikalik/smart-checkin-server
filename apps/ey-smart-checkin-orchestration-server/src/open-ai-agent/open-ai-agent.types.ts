export type OpenAiAgentConfig = {
  apiKey?: string;
  model?: string;
  baseUrl?: string;
  instructions?: string;
};

export const OPEN_AI_AGENT_CONFIG = Symbol('OPEN_AI_AGENT_CONFIG');

export type OpenAiResponse = {
  id: string;
  output?: Array<Record<string, unknown>>;
  output_text?: string;
};

export type OpenAiToolCall = {
  type: 'function_call';
  name: string;
  arguments: string;
  call_id: string;
};
