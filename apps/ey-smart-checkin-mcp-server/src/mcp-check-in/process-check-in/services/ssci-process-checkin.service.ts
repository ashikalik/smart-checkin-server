// apps/ey-smart-checkin-mcp-server/src/mcp-check-in/process-check-in/services/ssci-process-checkin.service.ts
import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

import { isMockEnabled, maybeMockDelay } from '../../common/ssci-mock.util';

export type ValidateProcessCheckinApiResponse = {
  data?: {
    isAccepted?: boolean;
    isPartial?: boolean;
    isVoluntaryDeniedBoarding?: boolean;
    notCheckedInJourneyElements?: Array<{ id?: string }>;
  };
  dictionaries?: {
    journeyElement?: Record<
      string,
      {
        id?: string;
        travelerId?: string;
        flightId?: string;
        orderId?: string;
        checkInStatus?: string;
      }
    >;
    traveler?: Record<
      string,
      {
        id?: string;
        passengerTypeCode?: string;
        names?: Array<{ title?: string; firstName?: string; lastName?: string }>;
      }
    >;
  };
};

@Injectable()
export class ValidateProcessCheckinService {
  // real endpoint base
  private readonly baseUrl =
    process.env.SSCI_PROCESS_CHECKIN_BASE_URL ??
    'https://test-digital.etihad.com/ada-services/ssci/ey-ssci-bff-checkin/process-check-in/v1';

  private readonly defaultHeaders = {
    'x-client-application': 'SSCI',
    'x-client-channel': 'WEB',
    'x-correlation-id': 'e5cdd169-e405-4386-b00c-a69832646ee9',
    'x-transaction-id': 'dbb9ec12-17f5-4fdb-9322-d13ebe73f3fe',
  } as const;

  // cached mock
  private mockData?: ValidateProcessCheckinApiResponse;
  private mockLoading?: Promise<ValidateProcessCheckinApiResponse>;

  constructor(private readonly http: HttpService) {}

  /**
   * Main entry: if MOCK on -> returns mock, else calls upstream.
   */
  async validateProcessCheckIn(params: {
    url?: string;
    resourceId?: string;
    areSecurityQuestionsAnswered?: boolean;
    rawBody?: unknown;
    headers?: Partial<Record<string, string>>;
    useMock?: boolean;
  }): Promise<ValidateProcessCheckinApiResponse> {
    if (isMockEnabled(params.useMock)) {
      await maybeMockDelay();
      return this.getMock();
    }
    return this.callUpstream(params);
  }

  /**
   * MOCK: GET mock JSON from local endpoint (cached).
   */
  async getMock(): Promise<ValidateProcessCheckinApiResponse> {
    return this.loadMockData();
  }

  private async loadMockData(): Promise<ValidateProcessCheckinApiResponse> {
    if (this.mockData) return this.mockData;
    if (this.mockLoading) return this.mockLoading;

    const port = process.env.PORT ?? '3000';
    const url =
      process.env.VALIDATE_PROCESS_CHECKIN_MOCK_DATA_URL ??
      `http://localhost:${port}/mocks/oneway-onepax/validate-process-checkin`;

    this.mockLoading = firstValueFrom(this.http.get<ValidateProcessCheckinApiResponse>(url))
      .then((res) => {
        this.mockData = res.data;
        return res.data;
      })
      .catch((err) => {
        this.mockLoading = undefined; // allow retry
        throw err;
      });

    return this.mockLoading;
  }

  /**
   * REAL: POST to SSCI process check-in endpoint.
   * Note: if your upstream expects body even for validation, pass it via rawBody.
   */
  private async callUpstream(params: {
    url?: string;
    resourceId?: string;
    areSecurityQuestionsAnswered?: boolean;
    rawBody?: unknown;
    headers?: Partial<Record<string, string>>;
  }): Promise<ValidateProcessCheckinApiResponse> {
    const mergedHeaders: Record<string, string> = {
      ...this.defaultHeaders,
      ...(params.headers ?? {}),
    };

    // build url
    let url = params.url
      ? params.url
      : params.resourceId
        ? `${this.baseUrl}/${encodeURIComponent(params.resourceId)}`
        : this.baseUrl;

    if (!params.url && params.areSecurityQuestionsAnswered !== undefined) {
      const sep = url.includes('?') ? '&' : '?';
      url = `${url}${sep}areSecurityQuestionsAnswered=${encodeURIComponent(
        String(params.areSecurityQuestionsAnswered),
      )}`;
    }

    const response$ = this.http.post<ValidateProcessCheckinApiResponse>(url, params.rawBody ?? {}, {
      headers: mergedHeaders,
      timeout: 55_000,
    });

    const { data } = await firstValueFrom(response$);
    return data;
  }
}
