import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  OPEN_AI_AGENT_CONFIG,
  OpenAiAgentConfig,
  OpenAiResponse,
  OpenAiToolCall,
} from './open-ai-agent.types';

@Injectable()
export class OpenAiAgentService {
  private readonly logger = new Logger(OpenAiAgentService.name);

  constructor(@Inject(OPEN_AI_AGENT_CONFIG) private readonly config: OpenAiAgentConfig) {}

  async createResponse(payload: Record<string, unknown>): Promise<OpenAiResponse> {
    const apiKey = this.config.apiKey;
    const model = this.config.model;
    const baseUrl = this.config.baseUrl ?? 'https://api.openai.com/v1';

    this.logger.debug(`OPENAI_API_KEY loaded: ${Boolean(apiKey)}`);

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    if (!model) {
      throw new Error('OPENAI_MODEL is not set');
    }

    const res = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        instructions:
          this.config.instructions ??
          'You are an orchestration agent. You MUST use tools for every arithmetic or percentage calculation step. Do not do math in your head. Use tools repeatedly until all math is done. Return a concise final answer.',
        ...payload,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${text}`);
    }

    return (await res.json()) as OpenAiResponse;
  }

  buildTools(listToolsResult: unknown): unknown[] {
    const tools = (listToolsResult as { tools?: Array<Record<string, unknown>> }).tools ?? [];

    return tools
      .filter((tool) => typeof tool?.name === 'string')
      .map((tool) => {
        const parameters = this.ensureObjectSchema(tool.inputSchema);
        return {
          type: 'function',
          name: tool.name as string,
          description: tool.description as string | undefined,
          parameters,
          strict: true,
        };
      });
  }

  extractToolCalls(response: OpenAiResponse): OpenAiToolCall[] {
    const output = response.output ?? [];
    return output.filter((item) => item?.type === 'function_call') as OpenAiToolCall[];
  }

  formatToolNote(
    name: string,
    args: Record<string, unknown>,
    result: unknown,
    numberResult?: number,
  ): string {
    const argsText = JSON.stringify(args);
    const resultText = numberResult ?? this.extractTextFromToolResult(result);
    const display = resultText ?? JSON.stringify(result);
    return `${name}(${argsText}) => ${display}`;
  }

  extractOutputText(output?: Array<Record<string, unknown>>): string | undefined {
    if (!output) {
      return undefined;
    }
    const message = output.find((item) => item.type === 'message');
    const content = message?.content as Array<{ type?: string; text?: string }> | undefined;
    const textItem = content?.find((c) => c.type === 'output_text');
    return textItem?.text;
  }

  extractTextFromToolResult(result: unknown): string | undefined {
    if (!result || typeof result !== 'object') {
      return undefined;
    }
    const content = (result as { content?: Array<{ text?: string }> }).content;
    return content?.[0]?.text;
  }

  needsMoreTools(text: string): boolean {
    const hasDigits = /\d/.test(text);
    const hasMathWords = /\b(add|subtract|multiply|divide|percent|percentage|times|sum|total|plus|minus|over)\b/i.test(text);
    return hasDigits && hasMathWords;
  }

  private ensureObjectSchema(schema: unknown): Record<string, unknown> {
    if (!schema || typeof schema !== 'object') {
      return { type: 'object', properties: {}, additionalProperties: false };
    }
    const typed = schema as Record<string, unknown>;
    const withType = typed.type ? typed : { ...typed, type: 'object' };
    if (!withType.properties) {
      (withType as Record<string, unknown>).properties = {};
    }
    if (withType.additionalProperties === undefined) {
      (withType as Record<string, unknown>).additionalProperties = false;
    }
    return withType;
  }
}
