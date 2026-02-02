import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';

/**
 * SSCI - Retrieve Order (GraphQL)
 *
 * Endpoint:
 *   POST https://test-digital.etihad.com/ada-services/ssci/ey-ssci-bff-order/retrieve-order/v1/gql
 *
 * Required headers:
 *   x-client-application: SSCI
 *   x-client-channel: WEB
 *   x-correlation-id: e5cdd169-e405-4386-b00c-a69832646ee9
 *   x-transaction-id: 60be58cc-f0f9-424b-8c62-7cd10ca350d1
 */

export interface RetrieveOrderInputDto {
  lastName: string;
  recordLocator: string;
}

/**
 * MCP tool input schema for `ssci_retrieve_order_gql`.
 * Exported here so MCP can import it directly from the service.
 */
export const SsciRetrieveOrderGqlSchema = z.object({
  lastName: z.string().min(1),
  recordLocator: z.string().min(1),
  useMock: z.boolean().optional(),
  // Avoid z.record(...) because it generates JSON Schema with `propertyNames`,
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

export type SsciRetrieveOrderGqlToolInput = z.infer<typeof SsciRetrieveOrderGqlSchema>;

export interface RetrieveOrderVariables {
  input: RetrieveOrderInputDto;
}

export interface RetrieveOrderGraphqlRequest {
  operationName: 'GetOrderData' | string;
  variables: RetrieveOrderVariables;
  query: string;
}

export interface RetrieveOrderGraphqlResponse<TData = RetrieveOrderGraphqlData> {
  data?: TData;
  errors?: Array<{ message: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

export interface RetrieveOrderGraphqlData {
  getOrderData: RetrieveOrderData;
}

/**
 * This is intentionally a partial typing of the huge payload.
 * Add fields as you consume them.
 */
export interface RetrieveOrderData {
  recordLocator?: string;
  warnings?: unknown;
  associateOrderIds?: unknown;
  travelers?: Array<{
    id: string;
    passengerTypeCode?: string;
    dateOfBirth?: string;
    names?: Array<{
      firstName?: string;
      lastName?: string;
      title?: string;
      nameType?: string;
      isPreferred?: boolean;
    }>;
    regulatoryDetails?: Array<{
      id?: string;
      flightIds?: string[];
      regulatoryDocument?: {
        number?: string;
        expiryDate?: string;
        issuanceCountryCode?: string;
        nationalityCode?: string;
        gender?: string;
        birthDate?: string;
        documentType?: string;
      };
    }>;
  }> | null;
  contacts?: Array<{
    id?: string;
    travelerIds?: string[];
    category?: string;
    contactType?: string;
    purpose?: string;
    address?: string;
    deviceType?: string;
    countryPhoneExtension?: string;
    number?: string;
    freeFlowText?: string;
  }> | null;
  segments?: unknown[] | null;
  services?: unknown[] | null;
  journeyDictionary?: unknown | null;
  journeys?: unknown[] | null;
  [key: string]: unknown;
}

const GET_ORDER_DATA_QUERY = `query GetOrderData($input: RetrieveOrderInputDto!) {
  getOrderData(input: $input) {
    warnings
    associateOrderIds
    travelers
    frequentFlyerCards
    contacts
    segments
    freeCheckedBaggageAllowanceItems
    freeCarryOnAllowanceItems
    travelDocuments
    otherServiceInformations
    specialServiceInformations
    specialServiceRequests
    remarks
    seats
    services
    specialKeywords
    insurances
    stopOverDetails
    mybSegments
    contactDetailsUpdated
    additionalCollection
    umnrFlag
    nextFlightIndicator
    servicingPointOfSale
    creationPointOfSale
    flightCheckInTimer
    countryMandates
    cancelledOrSuspendedFlightFlag
    redemptionBookingFlag
    paymentffpNo
    currency
    recordLocator
    creationDateTime
    modificationDateTime
    checkInTimer
    groupBooking
    staffFlag
    pricedFlag
    ticketedFlag
    gdsFlag
    splitPNRFlag
    medaFlag
    frequentFlyerCards
    journeys {
      id
      type
      linkedJourneyIds
      flights
      travelers
      journeyElements
      acceptanceEligibility
      acceptance
      contacts
      isEligibleForVoluntaryDeniedBoarding
      isVoluntaryDeniedBoarding
      __typename
    }
    journeyDictionary {
      flight
      airline
      aircraft
      location
      country
      traveler
      journeyElement
      __typename
    }
    __typename
  }
}`;

@Injectable()
export class SsciRetrieveOrderGqlService {
  private readonly endpointUrl =
    'https://test-digital.etihad.com/ada-services/ssci/ey-ssci-bff-order/retrieve-order/v1/gql';

  private readonly defaultHeaders = {
    'x-client-application': 'SSCI',
    'x-client-channel': 'WEB',
    'x-correlation-id': 'e5cdd169-e405-4386-b00c-a69832646ee9',
    'x-transaction-id': '60be58cc-f0f9-424b-8c62-7cd10ca350d1',
    'X-BM-AUTHID':'b%dQTRZ7$&RSU&31',
    'X-BM-AUTHSecret':'8wHpQ3vLd4FF%ZGlour$E48@jqtnTekmW$P0',
  } as const;

  constructor(private readonly httpService: HttpService) {}

  /**
   * Calls the Retrieve Order GraphQL endpoint.
   *
   * You can override any header (e.g. correlation/transaction id) by passing `headers`.
   */
  async fetchOrderData(
    input: RetrieveOrderInputDto,
    headers?: Partial<Record<string, string>>,
  ): Promise<RetrieveOrderGraphqlResponse> {
    const mergedHeaders: Record<string, string> = {
      ...this.defaultHeaders,
      ...(headers ?? {}),
    };

    const payload: RetrieveOrderGraphqlRequest = {
      operationName: 'GetOrderData',
      variables: { input },
      query: GET_ORDER_DATA_QUERY,
    };

    const response$ = this.httpService.post<RetrieveOrderGraphqlResponse>(
      this.endpointUrl,
      payload,
      { headers: mergedHeaders, timeout: 55_000 },
    );

    const { data } = await firstValueFrom(response$);
    return data;
  }

  /**
   * Convenience helper to build the example payload you provided.
   */
  buildExampleInput(): RetrieveOrderInputDto {
    return {
      lastName: 'Singh',
      recordLocator: '9N8DHB',
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

function isMockEnabled(override?: boolean): boolean {
  if (typeof override === 'boolean') return override;
  return String(process.env.MOCK_SSCI ?? '').toLowerCase() === 'true';
}

async function maybeMockDelay(): Promise<void> {
  const ms = Number(process.env.MOCK_SSCI_DELAY_MS ?? 0);
  if (Number.isFinite(ms) && ms > 0) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}

function buildMockRetrieveOrderResponse(recordLocator: string, lastName: string): RetrieveOrderGraphqlResponse {
  return {
    data: {
      getOrderData: {
        recordLocator,
        warnings: null,
        associateOrderIds: null,
        travelers: [
          {
            id: 'MOCK-PT1',
            passengerTypeCode: 'ADT',
            names: [{ firstName: 'MOCK', lastName, title: 'MR', nameType: 'universal', isPreferred: true }],
          },
        ],
        contacts: [],
        journeys: null,
        journeyDictionary: null,
        __typename: 'RetrieveOrderResponseGql',
      },
    },
  };
}

/**
 * Ready-to-register MCP tool for SSCI Retrieve Order (GraphQL).
 * Import this object in `McpService` and register directly.
 */
export const ssciRetrieveOrderGqlMcpTool = {
  name: 'ssci_retrieve_order_gql',
  definition: {
    description:
      'Call SSCI Retrieve Order GraphQL API (GetOrderData) and return getOrderData payload.',
    inputSchema: SsciRetrieveOrderGqlSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  handler:
    (orderService: SsciRetrieveOrderGqlService) =>
    async (input: SsciRetrieveOrderGqlToolInput): Promise<McpToolResponse> => {
      try {
        const { headers, lastName, recordLocator, useMock } = input;
        if (isMockEnabled(useMock)) {
          await maybeMockDelay();
          return toToolResponse(buildMockRetrieveOrderResponse(recordLocator, lastName));
        }
        const headerOverrides =
          headers && typeof headers === 'object'
            ? (Object.fromEntries(
                Object.entries(headers).filter(([, v]) => typeof v === 'string' && v.length > 0),
              ) as Partial<Record<string, string>>)
            : undefined;

        const apiRes = await orderService.fetchOrderData(
          { lastName, recordLocator },
          headerOverrides,
        );
        return toToolResponse(apiRes);
      } catch (e: any) {
        return toToolError(e?.message ?? 'ssci_retrieve_order_gql failed');
      }
    },
} as const;
