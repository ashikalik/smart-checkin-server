import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

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