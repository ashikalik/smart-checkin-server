import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';
import journeyMock from '../../mocks/oneway-onepax/journey.json';
import { JourneysListReply } from '@etihad-core/models';

/**
 * IMPORTANT:
 * This import assumes the mock JSON is inside the *same source code* tree, e.g.
 *   apps/ey-smart-checkin-mcp-server/src/mocks/oneway-onepax/journey.json
 *
 * And your tsconfig has:
 *   "resolveJsonModule": true
 *   "esModuleInterop": true
 */


/**
 * SSCI - Journey Identification
 *
 * Endpoint:
 *   POST https://test-digital.etihad.com/ada-services/ssci/ey-ssci-bff-order/identification/v1/journey
 *
 * Required headers:
 *   x-client-application: SSCI
 *   x-client-channel: WEB
 *   x-correlation-id: e5cdd169-e405-4386-b00c-a69832646ee9
 *   x-transaction-id: 6724360d-b130-4bf7-97f4-d8bda4bd2c82
 */

export interface JourneyIdentificationRequestPayload {
  identifier: string;
  lastName: string;
  encrypted: boolean;
  firstName: string | null;
  program: string | null;
  encryptedParameters: unknown | null;
}

/**
 * MCP tool input schema for `ssci_identification_journey`.
 * Exported here so MCP can import it directly from the service.
 */
export const SsciJourneyIdentificationSchema = z.object({
  identifier: z.string().min(1).describe('Record locator / identifier'),
  lastName: z.string().min(1),
  // Only `identifier` and `lastName` are required for the tool caller.
  // Everything else defaults to the upstream-friendly values below.
  encrypted: z.boolean().optional().default(false),
  firstName: z.string().nullable().optional().default(null),
  program: z.string().nullable().optional().default(null),
  // Keep JSON Schema simple/valid for OpenAI tools.
  // If you need actual encrypted params later, widen this safely.
  encryptedParameters: z.null().optional().default(null),
  // NOTE: We avoid z.record(...) because it generates JSON Schema with `propertyNames`,
  // which OpenAI rejects for function parameters.
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

export type SsciJourneyIdentificationToolInput = z.infer<typeof SsciJourneyIdentificationSchema>;


@Injectable()
export class SsciJourneyIdentificationService {
  private readonly endpointUrl =
    'https://test-digital.etihad.com/ada-services/ssci/ey-ssci-bff-order/identification/v1/journey';

  private readonly defaultHeaders = {
    'x-client-application': 'SSCI',
    'x-client-channel': 'WEB',
    'x-correlation-id': 'e5cdd169-e405-4386-b00c-a69832646ee9',
    'x-transaction-id': '6724360d-b130-4bf7-97f4-d8bda4bd2c82',
  } as const;

  constructor(private readonly httpService: HttpService) {}

  /**
   * Calls the Journey Identification endpoint.
   *
   * You can override any header (e.g. correlation/transaction id) by passing `headers`.
   */
  async fetchJourneyIdentification(
    payload: JourneyIdentificationRequestPayload,
    headers?: Partial<Record<string, string>>,
  ): Promise<JourneysListReply> {
    const mergedHeaders: Record<string, string> = {
      ...this.defaultHeaders,
      ...(headers ?? {}),
    };

    const response$ = this.httpService.post<JourneysListReply>(
      this.endpointUrl,
      payload,
      {
        headers: mergedHeaders,
        timeout: 55_000,
      },
    );

    const { data } = await firstValueFrom(response$);
    return data;
  }

  /**
   * Convenience helper to build the example payload you provided.
   */
  buildExamplePayload(): JourneyIdentificationRequestPayload {
    return {
      identifier: '9N8DHB',
      lastName: 'Singh',
      encrypted: false,
      firstName: null,
      program: null,
      encryptedParameters: null,
    };
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

export function isMockEnabled(): boolean {
  return String(process.env.MOCK_SSCI ?? '').toLowerCase() === 'true';
}

export async function maybeMockDelay(): Promise<void> {
  const ms = Number(process.env.MOCK_SSCI_DELAY_MS ?? 0);
  if (Number.isFinite(ms) && ms > 0) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

/**
 * MOCK MODE:
 * - Import JSON from source tree (no fs)
 * - Patch identifier (PNR) + traveler lastName from tool input
 */
export function buildMockJourneyResponse(
  identifier: string,
  lastName: string,
): JourneysListReply {
  // Import or define the mock data for journeyMock

  
    const fixture = deepClone(journeyMock as JourneysListReply);

  // Patch journey id if it follows MOCK-* convention
  if (fixture.journeys?.[0]?.id && fixture.journeys[0].id.startsWith('MOCK-')) {
    fixture.journeys[0].id = `MOCK-${identifier}`;
  }

  // Patch all traveler last names (across all journeys)
  for (const j of fixture.journeys ?? []) {
    for (const t of j.travelers ?? []) {
      for (const n of t.names ?? []) {
        if (n && typeof n === 'object') {
          n.lastName = lastName;
        }
      }
    }
  }

  return fixture;
}

function extractTravelerIdsByJourney(apiRes: JourneysListReply): Record<string, string[]> {
  const out: Record<string, string[]> = {};

  for (const j of apiRes.journeys ?? []) {
    const ids = new Set<string>();

    // Primary source
    for (const t of j.travelers ?? []) {
      if (t?.id) ids.add(t.id);
    }


    out[j.id] = Array.from(ids);
  }

  return out;
}

function extractAllTravelerIds(apiRes: JourneysListReply): string[] {
  const byJourney = extractTravelerIdsByJourney(apiRes);
  const all = new Set<string>();
  for (const ids of Object.values(byJourney)) {
    for (const id of ids) all.add(id);
  }
  return Array.from(all);
}

/**
 * Ready-to-register MCP tool for SSCI Journey Identification.
 * Import this object in `McpService` and register directly.
 */
export const ssciIdentificationJourneyMcpTool = {
  name: 'ssci_identification_journey',
  definition: {
    description: 'Call SSCI Journey Identification API (POST journey) and return journeys/dictionary.',
    inputSchema: SsciJourneyIdentificationSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  handler:
    (journeyService: SsciJourneyIdentificationService) =>
    async (input: SsciJourneyIdentificationToolInput): Promise<McpToolResponse> => {
      try {
        const { headers, ...payload } = input;

        // Normalize tool input -> API payload (ensure required keys exist).
        const apiPayload: JourneyIdentificationRequestPayload = {
          identifier: payload.identifier,
          lastName: payload.lastName,
          encrypted: payload.encrypted ?? false,
          firstName: payload.firstName ?? null,
          program: payload.program ?? null,
          encryptedParameters: payload.encryptedParameters ?? null,
        };

        // MOCK MODE: return fixture JSON patched with identifier + lastName
        if (isMockEnabled()) {
          await maybeMockDelay();
          const mockRes = buildMockJourneyResponse(apiPayload.identifier, apiPayload.lastName);

          return toToolResponse({
            ...mockRes,
            derived: {
              travelerIds: extractAllTravelerIds(mockRes),
              travelerIdsByJourney: extractTravelerIdsByJourney(mockRes),
            },
          });
        }

        // REAL MODE: call API, return response as-is (plus derived)
        const headerOverrides =
          headers && typeof headers === 'object'
            ? (Object.fromEntries(
                Object.entries(headers).filter(([, v]) => typeof v === 'string' && v.length > 0),
              ) as Partial<Record<string, string>>)
            : undefined;

        const apiRes = await journeyService.fetchJourneyIdentification(apiPayload, headerOverrides);

        return toToolResponse({
          ...apiRes,
          derived: {
            travelerIds: extractAllTravelerIds(apiRes),
            travelerIdsByJourney: extractTravelerIdsByJourney(apiRes),
          },
        });
      } catch (e: any) {
        return toToolError(e?.message ?? 'ssci_identification_journey failed');
      }
    },
} as const;
