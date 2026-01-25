import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  OPEN_AI_CHAT_MODEL_CONFIG,
  OpenAiChatModelConfig,
  OpenAiResponse,
  OpenAiToolCall,
} from './open-ai-chat-model.types';

@Injectable()
export class OpenAiChatModelService {
  private readonly logger = new Logger(OpenAiChatModelService.name);

  constructor(@Inject(OPEN_AI_CHAT_MODEL_CONFIG) private readonly config: OpenAiChatModelConfig) {}

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

    const requestBody = {
      model,
      instructions:
        this.config.instructions ??
        'You are an orchestration agent. You MUST use tools for every arithmetic or percentage calculation step. Do not do math in your head. Use tools repeatedly until all math is done. Return a concise final answer.',
      ...payload,
    };

    this.logger.debug(
      `OpenAI request payload: ${JSON.stringify({
        ...requestBody,
        // Avoid logging large/binary or sensitive blobs.
        input: (payload as { input?: unknown }).input,
      })}`,
    );

    const res = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI API error ${res.status}: ${text}`);
    }

    return (await res.json()) as OpenAiResponse;
  }

  extractToolCalls(response: OpenAiResponse): OpenAiToolCall[] {
    const output = response.output ?? [];
    return output.filter((item) => item?.type === 'function_call') as OpenAiToolCall[];
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

  needsMoreTools(text: string): boolean {
    const hasDigits = /\d/.test(text);
    const hasMathWords = /\b(add|subtract|multiply|divide|percent|percentage|times|sum|total|plus|minus|over)\b/i.test(text);
    return hasDigits && hasMathWords;
  }
}
