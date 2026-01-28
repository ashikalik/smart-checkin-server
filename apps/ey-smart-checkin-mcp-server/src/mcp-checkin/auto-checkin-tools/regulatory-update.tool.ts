import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';
 
/**
 * SSCI - Regulatory Details (POST update)
 *
 * POST https://.../regulatory-details/v1/{id}/travelers/{travelerId}
 *
 * Configure base URL via:
 *   SSCI_REGULATORY_DETAILS_BASE_URL
 */
 
export const SsciRegulatoryDetailsUpdateSchema = z.object({
  url: z.string().url().optional().describe('Optional full endpoint URL override'),
  id: z.string().min(1).optional().describe('Path id (first segment after /v1/)'),
  travelerId: z.string().min(1).optional().describe('Traveler id for /travelers/{travelerId}'),
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
 
export type SsciRegulatoryDetailsUpdateToolInput = z.infer<typeof SsciRegulatoryDetailsUpdateSchema>;
 
export interface SsciRegulatoryDetailsUpdateResponse {
  [key: string]: unknown;
}
 
@Injectable()
export class SsciRegulatoryDetailsUpdateService {
  private readonly baseUrl =
    process.env.SSCI_REGULATORY_DETAILS_BASE_URL ??
    'https://test-digital.etihad.com/ada-services/ssci/ey-ssci-bff-checkin/regulatory-details/v1';
 
  private readonly defaultHeaders = {
    'x-client-application': 'SSCI',
    'x-client-channel': 'WEB',
    'x-correlation-id': 'e5cdd169-e405-4386-b00c-a69832646ee9',
    'x-transaction-id': '51a88553-7ecb-4d45-ba9f-58abef2c0fd2',
  } as const;
 
  constructor(private readonly httpService: HttpService) {}
 
  private resolveUrl(params: { url?: string; id?: string; travelerId?: string }): string {
    const url = params.url
      ? params.url
      : params.id && params.travelerId
        ? `${this.baseUrl}/${encodeURIComponent(params.id)}/travelers/${encodeURIComponent(params.travelerId)}`
        : null;
 
    if (!url) {
      throw new Error('ssci_regulatory_details_update: provide either url OR (id and travelerId)');
    }
    return url;
  }
 
  async updateRegulatoryDetails(params: {
    url?: string;
    id?: string;
    travelerId?: string;
    body: unknown;
    headers?: Partial<Record<string, string>>;
  }): Promise<SsciRegulatoryDetailsUpdateResponse> {
    const mergedHeaders: Record<string, string> = {
      ...this.defaultHeaders,
      ...(params.headers ?? {}),
    };
 
    const url = this.resolveUrl(params);
    const response$ = this.httpService.post<SsciRegulatoryDetailsUpdateResponse>(url, params.body, {
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
 
/**
 * Ready-to-register MCP tool for SSCI Regulatory Details (POST update).
 */
export const ssciRegulatoryDetailsUpdateMcpTool = {
  name: 'ssci_regulatory_details_update',
  definition: {
    description:
      'Call SSCI Regulatory Details endpoint (POST) to add/decline traveler regulatory details and return the response.',
    inputSchema: SsciRegulatoryDetailsUpdateSchema,
    annotations: { readOnlyHint: false, idempotentHint: false },
  },
  handler:
    (svc: SsciRegulatoryDetailsUpdateService) =>
    async (input: SsciRegulatoryDetailsUpdateToolInput): Promise<McpToolResponse> => {
      try {
        const { headers, url, id, travelerId, rawBody } = input;
 
        let body: unknown;
        try {
          body = JSON.parse(rawBody);
        } catch {
          return toToolError('ssci_regulatory_details_update: rawBody must be valid JSON');
        }
 
        if (isMockEnabled()) {
          await maybeMockDelay();
          return toToolResponse({ ok: true, mocked: true, params: { url, id, travelerId }, receivedBody: body });
        }
 
        const headerOverrides =
          headers && typeof headers === 'object'
            ? (Object.fromEntries(
                Object.entries(headers).filter(([, v]) => typeof v === 'string' && v.length > 0),
              ) as Partial<Record<string, string>>)
            : undefined;
 
        const apiRes = await svc.updateRegulatoryDetails({
          url,
          id,
          travelerId,
          body,
          headers: headerOverrides,
        });
 
        return toToolResponse(apiRes);
      } catch (e: any) {
        return toToolError(e?.message ?? 'ssci_regulatory_details_update failed');
      }
    },
} as const;