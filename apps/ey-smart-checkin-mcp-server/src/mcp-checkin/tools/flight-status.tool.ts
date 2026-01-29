import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';

/**
 * SSCI - Flight Status
 *
 * Endpoint:
 *   POST https://test-digital.etihad.com/ada-services/ssci/ey-ssci-bff-order/flight-status/v1/flight-status/get
 *
 * Required headers (observed/likely):
 *   x-client-application: SSCI
 *   x-client-channel: WEB
 *   x-ey-oid: test-ada
 *   X-BM-AUTHID / X-BM-AUTHSecret (same as journey tool)
 *
 * Body: array of flight queries
 */

export interface FlightStatusRequestItem {
  carrier: string;
  flightNumber: string;
  departureDate: string; // YYYY-MM-DD
  origin: string;
  destination: string;
  language?: string;
}

export interface FlightStatusResponse {
  flightStatus?: unknown[];
  [key: string]: unknown;
}

/**
 * MCP tool input schema for `ssci_flight_status_get`.
 * Keep it aligned with your other tools: Zod schema + optional header overrides.
 */
export const SsciFlightStatusSchema = z.object({
  flights: z
    .array(
      z.object({
        carrier: z.string().min(1),
        flightNumber: z.string().min(1),
        departureDate: z.string().min(1),
        origin: z.string().min(3),
        destination: z.string().min(3),
        language: z.string().optional(),
      }),
    )
    .min(1)
    .describe('Array of flight status queries'),

  headers: z
    .object({
      'x-correlation-id': z.string().optional(),
      'x-transaction-id': z.string().optional(),
      'x-client-application': z.string().optional(),
      'x-client-channel': z.string().optional(),
      'x-ey-oid': z.string().optional(),
      // Allow overrides for BM headers too (helps if they rotate)
      'X-BM-AUTHID': z.string().optional(),
      'X-BM-AUTHSecret': z.string().optional(),
      // Some gateways/WAFs behave better if these exist (optional)
      origin: z.string().optional(),
      referer: z.string().optional(),
      // Optional auth passthrough for lower env experiments
      authorization: z.string().optional(),
      cookie: z.string().optional(),
    })
    .optional()
    .describe('Optional header overrides. Values here override defaults.'),
});

export type SsciFlightStatusToolInput = z.infer<typeof SsciFlightStatusSchema>;

@Injectable()
export class SsciFlightStatusService {
  private readonly endpointUrl =
    'https://test-digital.etihad.com/ada-services/ssci/ey-ssci-bff-order/flight-status/v1/flight-status/get';

  // Mirror retrieve-journey defaults (including BM headers)
  private readonly defaultHeaders = {
    'x-client-application': 'SSCI',
    'x-client-channel': 'WEB',
    'x-ey-oid': 'test-ada',

    // ✅ Important: same bot-manager headers that made journey work
    'X-BM-AUTHID': '',
    'X-BM-AUTHSecret': '',
  } as const;

  constructor(private readonly httpService: HttpService) {}

  async fetchFlightStatus(
    flights: FlightStatusRequestItem[],
    headers?: Partial<Record<string, string>>,
  ): Promise<FlightStatusResponse> {
    const mergedHeaders: Record<string, string> = {
      ...this.defaultHeaders,
      ...(headers ?? {}),
      'content-type': 'application/json',
    };

    const response$ = this.httpService.post<FlightStatusResponse>(this.endpointUrl, flights, {
      headers: mergedHeaders,
      timeout: 55_000, // match journey tool (you can tune later)
    });

    const { data } = await firstValueFrom(response$);
    return data;
  }

  buildExampleFlights(): FlightStatusRequestItem[] {
    return [
      {
        carrier: 'EY',
        flightNumber: '397',
        departureDate: '2026-01-24',
        origin: 'CMB',
        destination: 'AUH',
        language: 'en',
      },
    ];
  }
}

type McpToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

function toToolResponse(data: unknown): McpToolResponse {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

function toToolError(message: string, details?: unknown): McpToolResponse {
  const payload =
    details === undefined ? { message } : { message, details };
  return { isError: true, content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
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

export function buildMockFlightStatusResponse(
  flights: FlightStatusRequestItem[],
): FlightStatusResponse {
  return {
    flightStatus: flights.map((f) => ({
      searchOrigin: f.origin,
      searchDestination: f.destination,
      searchDate: f.departureDate,
      onds: [
        {
          origin: f.origin,
          destination: f.destination,
          flights: [
            {
              carrier: f.carrier,
              flightNumber: f.flightNumber,
              flightStatus: 'Scheduled',
              flightStatusCode: 'SCH',
              statusType: 'success',
            },
          ],
        },
      ],
    })),
  };
}

/**
 * Ready-to-register MCP tool for SSCI Flight Status.
 * Import this object in `checkin-mcp.service.ts` and register directly.
 */
export const ssciFlightStatusMcpTool = {
  name: 'ssci_flight_status_get',
  definition: {
    description: 'Call SSCI Flight Status API and return flightStatus payload.',
    inputSchema: SsciFlightStatusSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  handler:
    (flightStatusService: SsciFlightStatusService) =>
    async (input: SsciFlightStatusToolInput): Promise<McpToolResponse> => {
      try {
        const { headers, flights } = input;

        if (isMockEnabled()) {
          await maybeMockDelay();
          return toToolResponse(buildMockFlightStatusResponse(flights));
        }

        const headerOverrides =
          headers && typeof headers === 'object'
            ? (Object.fromEntries(
                Object.entries(headers).filter(([, v]) => typeof v === 'string' && v.length > 0),
              ) as Partial<Record<string, string>>)
            : undefined;

        const apiRes = await flightStatusService.fetchFlightStatus(flights, headerOverrides);
        return toToolResponse(apiRes);
      } catch (err: any) {
        // Rich error details (same spirit as your improved handler)
        const status = err?.response?.status;
        const data = err?.response?.data;
        const code = err?.code;
        const msg = err?.message;

        return toToolError('ssci_flight_status_get failed', {
          status,
          code,
          errorMessage: msg,
          data,
        });
      }
    },
} as const;
