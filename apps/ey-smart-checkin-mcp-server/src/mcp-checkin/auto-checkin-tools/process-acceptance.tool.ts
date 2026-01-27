import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';

/**
 * SSCI - Process Check-in
 *
 * Endpoint varies by environment; configure via:
 *   SSCI_PROCESS_CHECKIN_URL
 *
 * Example header set (same pattern as other SSCI BFF calls):
 *   x-client-application: SSCI
 *   x-client-channel: WEB
 *   x-correlation-id: <uuid>
 *   x-transaction-id: <uuid>
 */

/**
 * MCP tool input schema for `ssci_process_checkin`.
 *
 * We accept a raw JSON string for the request body so this tool can forward
 * whatever the upstream "process checkin" endpoint expects without constantly
 * changing JSON Schema (and without using z.record(...) which OpenAI rejects).
 */
export const SsciProcessCheckinSchema = z.object({
  /**
   * Optional full URL to call. Use this when the endpoint includes a path id, e.g.
   * https://.../process-check-in/v1/<id>
   */
  url: z.string().url().optional().describe('Optional full endpoint URL override'),
  /**
   * Optional resource id appended to the base URL (when `url` is not provided).
   */
  resourceId: z.string().min(1).optional().describe('Optional path id appended to base URL'),
  /**
   * Optional query flag used by /process-check-in/v1/{id}?areSecurityQuestionsAnswered=false|true
   * Only applied when `url` is not provided (i.e. when building from baseUrl/resourceId).
   */
  areSecurityQuestionsAnswered: z
    .boolean()
    .optional()
    .describe('Optional query param appended as areSecurityQuestionsAnswered'),
  /**
   * Raw JSON string to POST as request body.
   * Example: "{\"recordLocator\":\"75C68C\",\"lastName\":\"TESTK\",...}"
   */
  rawBody: z.string().min(2).describe('Raw JSON string for request body'),
  headers: z
    .object({
      'x-correlation-id': z.string().optional(),
      'x-transaction-id': z.string().optional(),
      'x-client-application': z.string().optional(),
      'x-client-channel': z.string().optional(),
    })
    .optional()
    .describe('Optional header overrides. Values here override defaults.'),
});

export type SsciProcessCheckinToolInput = z.infer<typeof SsciProcessCheckinSchema>;

export interface SsciProcessCheckinResponse {
  [key: string]: unknown;
}

@Injectable()
export class SsciProcessCheckinService {
  private readonly baseUrl =
    process.env.SSCI_PROCESS_CHECKIN_BASE_URL ??
    'https://test-digital.etihad.com/ada-services/ssci/ey-ssci-bff-checkin/process-check-in/v1';

  private readonly defaultHeaders = {
    'x-client-application': 'SSCI',
    'x-client-channel': 'WEB',
    'x-correlation-id': 'e5cdd169-e405-4386-b00c-a69832646ee9',
    'x-transaction-id': 'dbb9ec12-17f5-4fdb-9322-d13ebe73f3fe',
    'X-BM-AUTHID':'b%dQTRZ7$&RSU&31',
    'X-BM-AUTHSecret':'8wHpQ3vLd4FF%ZGlour$E48@jqtnTekmW$P0',
  } as const;

  constructor(private readonly httpService: HttpService) {}

  async processCheckin(
    body: unknown,
    urlOrResourceId: { url?: string; resourceId?: string; areSecurityQuestionsAnswered?: boolean },
    query?: { areSecurityQuestionsAnswered?: boolean },
    headers?: Partial<Record<string, string>>,
  ): Promise<SsciProcessCheckinResponse> {
    const mergedHeaders: Record<string, string> = {
      ...this.defaultHeaders,
      ...(headers ?? {}),
    };

    let url = urlOrResourceId.url
      ? urlOrResourceId.url
      : urlOrResourceId.resourceId
        ? `${this.baseUrl}/${encodeURIComponent(urlOrResourceId.resourceId)}`
        : this.baseUrl;

    // Append query param only when we are building the URL (not when full URL is provided).
    if (!urlOrResourceId.url && query?.areSecurityQuestionsAnswered !== undefined) {
      const sep = url.includes('?') ? '&' : '?';
      url = `${url}${sep}areSecurityQuestionsAnswered=${encodeURIComponent(
        String(query.areSecurityQuestionsAnswered),
      )}`;
    }

    const response$ = this.httpService.post<SsciProcessCheckinResponse>(url, body, {
      headers: mergedHeaders,
      timeout: 55_000,
    });

    const { data } = await firstValueFrom(response$);
    return data;
  }
}

type McpToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

function toToolResponse(data: unknown): McpToolResponse {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function toToolError(message: string): McpToolResponse {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function isMockEnabled(): boolean {
  return String(process.env.MOCK_SSCI ?? '').toLowerCase() === 'true';
}

async function maybeMockDelay(): Promise<void> {
  const ms = Number(process.env.MOCK_SSCI_DELAY_MS ?? 0);
  if (Number.isFinite(ms) && ms > 0) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function buildMockProcessCheckinResponse(body: unknown): SsciProcessCheckinResponse {
  return {
    ok: true,
    mocked: true,
    receivedBody: body,
  };
}

/**
 * Ready-to-register MCP tool for SSCI Process Check-in.
 */
export const ssciProcessCheckinMcpTool = {
  name: 'ssci_process_checkin',
  definition: {
    description:
      'Call SSCI Process Check-in endpoint and return the response. Supports /process-check-in/v1/{id}?areSecurityQuestionsAnswered=...',
    inputSchema: SsciProcessCheckinSchema,
    annotations: { readOnlyHint: false, idempotentHint: false },
  },
  handler:
    (svc: SsciProcessCheckinService) =>
    async (input: SsciProcessCheckinToolInput): Promise<McpToolResponse> => {
      try {
        const { headers, rawBody, url, resourceId, areSecurityQuestionsAnswered } = input;

        let body: unknown;
        try {
          body = JSON.parse(rawBody);
        } catch {
          return toToolError('ssci_process_checkin: rawBody must be valid JSON');
        }

        if (isMockEnabled()) {
          await maybeMockDelay();
          return toToolResponse(buildMockProcessCheckinResponse(body));
        }

        const headerOverrides =
          headers && typeof headers === 'object'
            ? (Object.fromEntries(
                Object.entries(headers).filter(([, v]) => typeof v === 'string' && v.length > 0),
              ) as Partial<Record<string, string>>)
            : undefined;

        const apiRes = await svc.processCheckin(
          { url, resourceId },
          { areSecurityQuestionsAnswered },
          body,
          headerOverrides,
        );
        return toToolResponse(apiRes);
      } catch (e: any) {
        return toToolError(e?.message ?? 'ssci_process_checkin failed');
      }
    },
} as const;
