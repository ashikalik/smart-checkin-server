import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

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
      { headers: mergedHeaders },
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