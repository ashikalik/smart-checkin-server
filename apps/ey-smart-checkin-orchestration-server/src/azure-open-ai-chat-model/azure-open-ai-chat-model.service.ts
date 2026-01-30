import { Inject, Injectable, Logger } from '@nestjs/common';
import { AzureOpenAI } from 'openai';
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions';
import {
  AZURE_OPEN_AI_CHAT_MODEL_CONFIG,
  AzureOpenAiChatModelConfig,
  AzureOpenAiChatResponse,
} from './azure-open-ai-chat-model.types';

@Injectable()
export class AzureOpenAiChatModelService {
  private readonly logger = new Logger(AzureOpenAiChatModelService.name);

  constructor(@Inject(AZURE_OPEN_AI_CHAT_MODEL_CONFIG) private readonly config: AzureOpenAiChatModelConfig) {}

  async createResponse(payload: Record<string, unknown>): Promise<AzureOpenAiChatResponse> {
    const apiKey = this.config.apiKey;
    const endpoint = this.config.endpoint;
    const deployment = this.config.deployment;
    const apiVersion = this.config.apiVersion;
    const model = this.config.model;

    if (this.config.logRequests) {
      this.logger.debug(`AZURE_OPENAI_API_KEY loaded: ${Boolean(apiKey)}`);
    }

    if (!apiKey) {
      throw new Error('AZURE_OPENAI_API_KEY is not set');
    }
    if (!endpoint) {
      throw new Error('AZURE_OPENAI_ENDPOINT is not set');
    }
    if (!deployment) {
      throw new Error('AZURE_OPENAI_DEPLOYMENT is not set');
    }
    if (!apiVersion) {
      throw new Error('AZURE_OPENAI_API_VERSION is not set');
    }
    if (!model) {
      throw new Error('AZURE_OPENAI_MODEL is not set');
    }

    const requestBody = {
      model,
      ...payload,
    };

    if (this.config.logRequests) {
      this.logger.debug(
        `Azure OpenAI request payload: ${JSON.stringify({
          ...requestBody,
          // Avoid logging large/binary or sensitive blobs.
          messages: (payload as { messages?: unknown }).messages,
        })}`,
      );
    }

    const client = new AzureOpenAI({
      endpoint,
      apiKey,
      deployment,
      apiVersion,
    });

    const chatRequest = this.toChatCompletionsPayload(requestBody) as unknown as ChatCompletionCreateParamsNonStreaming;
    const response = await client.chat.completions.create(chatRequest);
    return this.normalizeChatCompletion(
      response as unknown as {
        id?: string;
        choices?: Array<{ message?: { content?: string; tool_calls?: Array<Record<string, unknown>> } }>;
      },
    );
  }

  extractToolCalls(response: AzureOpenAiChatResponse): Array<{
    type: 'function_call';
    name: string;
    arguments: string;
    call_id: string;
  }> {
    const output = response.output ?? [];
    const outputCalls = output.filter((item) => item?.type === 'function_call') as Array<{
      type: 'function_call';
      name: string;
      arguments: string;
      call_id: string;
    }>;
    if (outputCalls.length > 0) {
      return outputCalls;
    }

    const toolCalls =
      (response.choices?.[0]?.message?.tool_calls as Array<{
        id?: string;
        function?: { name?: string; arguments?: string };
      }>) ?? [];
    return toolCalls
      .map((call) => ({
        type: 'function_call' as const,
        name: call.function?.name ?? '',
        arguments: call.function?.arguments ?? '',
        call_id: call.id ?? '',
      }))
      .filter((call) => call.name && call.call_id);
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

  private toChatCompletionsPayload(requestBody: Record<string, unknown>): Record<string, unknown> {
    const model = requestBody.model as string;
    const instructions = requestBody.instructions as string | undefined;
    const input = requestBody.input as Array<{
      type?: string;
      role?: string;
      content?: Array<{ type?: string; text?: string }>;
    }>;
    const messages: Array<{ role: string; content: string }> = [];

    if (instructions) {
      messages.push({ role: 'system', content: instructions });
    }

    if (Array.isArray(input)) {
      for (const item of input) {
        if (item?.type !== 'message' || !item.role) {
          continue;
        }
        const text = item.content?.find((entry) => entry.type === 'input_text')?.text;
        if (!text) {
          continue;
        }
        messages.push({ role: item.role, content: text });
      }
    }

    const tools = Array.isArray(requestBody.tools)
      ? (requestBody.tools as Array<{
          type?: string;
          name?: string;
          description?: string;
          parameters?: unknown;
        }>)
          .filter((tool) => tool?.type === 'function' && tool.name)
          .map((tool) => ({
            type: 'function' as const,
            function: {
              name: tool.name as string,
              description: tool.description,
              parameters: tool.parameters,
            },
          }))
      : undefined;

    return {
      model,
      messages,
      tools: tools && tools.length > 0 ? tools : undefined,
      tool_choice: requestBody.tool_choice as 'auto' | 'required' | 'none' | Record<string, unknown> | undefined,
      max_completion_tokens: requestBody.max_completion_tokens as number | undefined,
    };
  }

  private normalizeChatCompletion(response: {
    id?: string;
    choices?: Array<{ message?: { content?: string; tool_calls?: Array<Record<string, unknown>> } }>;
  }): AzureOpenAiChatResponse {
    const content = response.choices?.[0]?.message?.content;
    const output =
      content !== undefined
        ? [
            {
              type: 'message',
              content: [{ type: 'output_text', text: content }],
            },
          ]
        : undefined;

    return {
      id: response.id,
      output_text: content,
      output,
      choices: response.choices,
    };
  }
}
