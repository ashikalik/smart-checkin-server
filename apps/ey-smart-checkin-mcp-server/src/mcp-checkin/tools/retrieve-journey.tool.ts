import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';

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

export interface JourneyIdentificationResponse {
  journeys: Journey[];
  journeyDictionary?: JourneyDictionary;
  genericEligibilities?: GenericEligibility[] | null;
  warnings?: unknown[];
  errors?: unknown[];
  [key: string]: unknown;
}

export interface Journey {
  id: string;
  type?: string;
  isGroupBooking?: boolean;
  acceptance?: {
    isAccepted?: boolean;
    isPartial?: boolean;
    isVoluntaryDeniedBoarding?: boolean;
    checkedInJourneyElements?: Array<{ id: string }>;
    notCheckedInJourneyElements?: Array<{ id: string }>;
  };
  acceptanceEligibility?: {
    status?: string;
    reasons?: string[];
    eligibilityWindow?: {
      openingDateAndTime?: string;
      closingDateAndTime?: string;
    };
  };
  flights?: Array<{
    id: string;
    status?: string;
    acceptanceStatus?: string;
    aircraftCode?: string;
    marketingAirlineCode?: string;
    marketingFlightNumber?: string;
    operatingAirlineCode?: string;
    operatingAirlineFlightNumber?: string;
    operatingAirlineName?: string;
    operatingFlightNumber?: string;
    departure?: {
      dateTime?: string;
      locationCode?: string;
      terminal?: string;
    };
    arrival?: {
      dateTime?: string;
      locationCode?: string;
      terminal?: string;
    };
    duration?: number;
    isIATCI?: boolean;
    isPilgrimConfirmationRequired?: boolean;
  }>;
  journeyElements?: Array<{
    id: string;
    flightId?: string;
    orderId?: string;
    travelerId?: string;
    cabin?: string;
    checkInStatus?: string;
    boardingStatus?: string;
    boardingPassPrintStatus?: string;
    acceptanceEligibility?: {
      status?: string;
      reasons?: string[];
      eligibilityWindow?: {
        openingDateAndTime?: string;
        closingDateAndTime?: string;
      };
    };
    boardingPassEligibility?: {
      status?: string;
      reasons?: string[];
    };
    seat?: {
      seatNumber?: string;
      cabin?: string;
      seatAvailabilityStatus?: string;
      seatCharacteristicsCodes?: string[];
      isInfantAloneOnSeat?: boolean;
      isInfantOnSeat?: boolean;
    };
    seatmapEligibility?: {
      status?: string;
    };
    fareFamily?: {
      code?: string;
    };
    regulatoryProgramsCheckStatuses?: Array<{
      regulatoryProgram?: { name?: string };
      statuses?: Array<{ statusCode?: string }>;
    }>;
  }>;
  travelers?: Array<{
    id: string;
    passengerTypeCode?: string;
    gender?: string;
    dateOfBirth?: string;
    isPilgrimConfirmationProvided?: boolean;
    names?: Array<{
      nameType?: string;
      title?: string;
      firstName?: string;
      lastName?: string;
    }>;
  }>;
  contacts?: Array<{
    id?: string;
    category?: string;
    contactType?: string;
    purpose?: string;
    lang?: string;
    address?: string;
    countryPhoneExtension?: string;
    number?: string;
    travelerIds?: string[];
  }>;
  services?: Array<{
    id: string;
    travelerId?: string;
    statusCode?: string;
    quantity?: number;
    flightIds?: string[];
    descriptions?: Array<{ type?: string; content?: string }>;
  }>;
  [key: string]: unknown;
}

export interface JourneyDictionary {
  aircraft?: Record<string, string>;
  airline?: Record<string, string>;
  country?: Record<string, string>;
  flight?: Record<string, unknown>;
  journeyElement?: Record<string, unknown>;
  location?: Record<string, unknown>;
  traveler?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface GenericEligibility {
  eligiblityName: string;
  isEligible: boolean;
  journeyIds?: string[] | null;
  journeyElementIds?: string[] | null;
  [key: string]: unknown;
}

@Injectable()
export class SsciJourneyIdentificationService {
  private readonly endpointUrl =
    'https://test-digital.etihad.com/ada-services/ssci/ey-ssci-bff-order/identification/v1/journey';

  private readonly defaultHeaders = {
    'x-client-application': 'SSCI',
    'x-client-channel': 'WEB',
    'x-correlation-id': 'e5cdd169-e405-4386-b00c-a69832646ee9',
    'x-transaction-id': '6724360d-b130-4bf7-97f4-d8bda4bd2c82',
    'X-BM-AUTHID':'b%dQTRZ7$&RSU&31',
    'X-BM-AUTHSecret':'8wHpQ3vLd4FF%ZGlour$E48@jqtnTekmW$P0',

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
  ): Promise<JourneyIdentificationResponse> {
    const mergedHeaders: Record<string, string> = {
      ...this.defaultHeaders,
      ...(headers ?? {}),
    };

    const response$ = this.httpService.post<JourneyIdentificationResponse>(
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

export function buildMockJourneyResponse(
  identifier: string,
  lastName: string,
): JourneyIdentificationResponse {
  return {
    journeys: [
      {
        id: `MOCK-${identifier}`,
        type: 'standalone',
        isGroupBooking: false,
        acceptance: { isAccepted: false, isPartial: false, isVoluntaryDeniedBoarding: false },
        flights: [
          {
            id: 'MOCK-FLT-1',
            marketingAirlineCode: 'EY',
            marketingFlightNumber: '239',
            operatingAirlineCode: 'EY',
            operatingAirlineName: 'ETIHAD AIRWAYS',
            status: 'scheduled',
            departure: { locationCode: 'BLR', dateTime: '2026-01-23T22:00:00+05:30' },
            arrival: { locationCode: 'AUH', dateTime: '2026-01-24T00:35:00+04:00' },
          },
        ],
        travelers: [
          {
            id: 'MOCK-TRV-1',
            passengerTypeCode: 'ADT',
            names: [{ firstName: 'MOCK', lastName: lastName, title: 'MR', nameType: 'universal' }],
          },
        ],
      },
    ],
    journeyDictionary: {
      airline: { EY: 'ETIHAD AIRWAYS' },
      aircraft: { MOCK: 'MOCK AIRCRAFT' },
    },
    genericEligibilities: [],
    warnings: [],
    errors: [],
  };
}

/**
 * Ready-to-register MCP tool for SSCI Journey Identification.
 * Import this object in `McpService` and register directly.
 */
export const ssciIdentificationJourneyMcpTool = {
  name: 'ssci_identification_journey',
  definition: {
    description:
      'Call SSCI Journey Identification API (POST journey) and return journeys/dictionary.',
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

        if (isMockEnabled()) {
          await maybeMockDelay();
          return toToolResponse(buildMockJourneyResponse(apiPayload.identifier, apiPayload.lastName));
        }

        const headerOverrides =
          headers && typeof headers === 'object'
            ? (Object.fromEntries(
                Object.entries(headers).filter(([, v]) => typeof v === 'string' && v.length > 0),
              ) as Partial<Record<string, string>>)
            : undefined;

        const apiRes = await journeyService.fetchJourneyIdentification(apiPayload, headerOverrides);
        return toToolResponse(apiRes);
      } catch (e: any) {
        return toToolError(e?.message ?? 'ssci_identification_journey failed');
      }
    },
} as const;
