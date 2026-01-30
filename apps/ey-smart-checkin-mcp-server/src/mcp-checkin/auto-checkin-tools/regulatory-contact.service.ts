import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';

/**
 * SSCI - Regulatory Details (Contacts)
 *
 * POST https://.../regulatory-details/v1/contact/{id}
 *
 * Configure base URL via:
 *   SSCI_REGULATORY_CONTACT_BASE_URL
 * default:
 *   https://test-digital.etihad.com/ada-services/ssci/ey-ssci-bff-checkin/regulatory-details/v1/contact
 */

export const SsciRegulatoryContactUpdateSchema = z.object({
  /**
   * Optional full URL override.
   * Example: https://.../regulatory-details/v1/contact/{id}
   */
  url: z.string().url().optional().describe('Optional full endpoint URL override'),
  /**
   * If `url` is not provided, we will call: {baseUrl}/{id}
   */
  id: z.string().min(1).optional().describe('Path id appended to /contact'),
  /**
   * Raw JSON string body to POST.
   * This endpoint expects an array of contact objects.
   */
  rawBody: z.string().min(2).describe('Raw JSON string body (array of contacts)'),
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

export type SsciRegulatoryContactUpdateToolInput = z.infer<typeof SsciRegulatoryContactUpdateSchema>;

export interface SsciRegulatoryContactResponse {
  [key: string]: unknown;
}

@Injectable()
export class SsciRegulatoryContactService {
  private readonly baseUrl =
    process.env.SSCI_REGULATORY_CONTACT_BASE_URL ??
    'https://test-digital.etihad.com/ada-services/ssci/ey-ssci-bff-checkin/regulatory-details/v1/contact';

  private readonly defaultHeaders = {
    'x-client-application': 'SSCI',
    'x-client-channel': 'WEB',
    'x-correlation-id': 'e5cdd169-e405-4386-b00c-a69832646ee9',
    'x-transaction-id': '84bb1960-16a0-4f8a-941e-1d6af5a0553a',
    'X-BM-AUTHID':'b%dQTRZ7$&RSU&31',
    'X-BM-AUTHSecret':'8wHpQ3vLd4FF%ZGlour$E48@jqtnTekmW$P0',
  } as const;

  constructor(private readonly httpService: HttpService) {}

  private resolveUrl(params: { url?: string; id?: string }): string {
    const url = params.url ? params.url : params.id ? `${this.baseUrl}/${encodeURIComponent(params.id)}` : null;
    if (!url) {
      throw new Error('ssci_regulatory_contact_update: provide either url OR id');
    }
    return url;
  }

  async updateContacts(params: {
    url?: string;
    id?: string;
    body: unknown;
    headers?: Partial<Record<string, string>>;
  }): Promise<SsciRegulatoryContactResponse> {
    const mergedHeaders: Record<string, string> = {
      ...this.defaultHeaders,
      ...(params.headers ?? {}),
    };

    const url = this.resolveUrl(params);
    const response$ = this.httpService.post<SsciRegulatoryContactResponse>(url, params.body, {
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

export const ssciRegulatoryContactUpdateMcpTool = {
  name: 'ssci_regulatory_contact_update',
  definition: {
    description: 'Call SSCI Regulatory Contact endpoint (POST) and return the response.',
    inputSchema: SsciRegulatoryContactUpdateSchema,
    annotations: { readOnlyHint: false, idempotentHint: false },
  },
  handler:
    (svc: SsciRegulatoryContactService) =>
    async (input: SsciRegulatoryContactUpdateToolInput): Promise<McpToolResponse> => {
      try {
        const { headers, url, id, rawBody } = input;

        let body: unknown;
        try {
          body = JSON.parse(rawBody);
        } catch {
          return toToolError('ssci_regulatory_contact_update: rawBody must be valid JSON');
        }

        if (!Array.isArray(body)) {
          return toToolError('ssci_regulatory_contact_update: rawBody must be a JSON array');
        }

        if (isMockEnabled()) {
          await maybeMockDelay();
          return toToolResponse({ ok: true, mocked: true, params: { url, id }, receivedBody: body });
        }

        const headerOverrides =
          headers && typeof headers === 'object'
            ? (Object.fromEntries(
                Object.entries(headers).filter(([, v]) => typeof v === 'string' && v.length > 0),
              ) as Partial<Record<string, string>>)
            : undefined;

        const apiRes = await svc.updateContacts({ url, id, body, headers: headerOverrides });
        return toToolResponse(apiRes);
      } catch (e: any) {
        return toToolError(e?.message ?? 'ssci_regulatory_contact_update failed');
      }
    },
} as const;
