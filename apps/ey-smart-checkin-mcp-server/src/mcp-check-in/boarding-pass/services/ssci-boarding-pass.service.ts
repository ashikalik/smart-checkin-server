import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

import { isMockEnabled, maybeMockDelay } from '../../common/ssci-mock.util';

export type BoardingPassApiResponse = {
  enableBPDisplay?: boolean;
  displayBoardingPriority?: boolean;
  enablePriorityAccessTextGroup?: boolean;
  creationDateTime?: string;
  boardingPassNotFound?: unknown[];
  boardingPasses?: Array<{
    travelerId?: string;
    travelerName?: string;
    legs?: Array<{
      travelerInfo?: Record<string, unknown>;
      flightInfo?: Record<string, unknown>;
      airportInfo?: Record<string, unknown>;
      boardingDetails?: Record<string, unknown>;
      extras?: Record<string, unknown>;
      fareBrandInfo?: Record<string, unknown>;
      barcodeMessage?: string;
      journeyElementId?: string;
      eligibility?: string;
      staffServiceCode?: string;
    }>;
  }>;
};

@Injectable()
export class BoardingPassService {
  private readonly baseUrl =
    process.env.SSCI_BOARDING_PASS_BASE_URL ??
    'https://test-digital.etihad.com/ada-services/ssci/ey-ssci-bff-checkin/boarding-pass/v1';

  private readonly defaultHeaders = {
    'x-client-application': 'SSCI',
    'x-client-channel': 'WEB',
    'x-correlation-id': 'e5cdd169-e405-4386-b00c-a69832646ee9',
    'x-transaction-id': 'dbb9ec12-17f5-4fdb-9322-d13ebe73f3fe',
  } as const;

  private mockData?: BoardingPassApiResponse;
  private mockLoading?: Promise<BoardingPassApiResponse>;

  constructor(private readonly http: HttpService) {}

  async getBoardingPass(params: {
    url?: string;
    resourceId?: string;
    rawBody?: unknown;
    headers?: Partial<Record<string, string>>;
    useMock?: boolean;
  }): Promise<BoardingPassApiResponse> {
    if (isMockEnabled(params.useMock)) {
      await maybeMockDelay();
      return this.getMock();
    }
    return this.callUpstream(params);
  }

  async getMock(): Promise<BoardingPassApiResponse> {
    return this.loadMockData();
  }

  private async loadMockData(): Promise<BoardingPassApiResponse> {
    if (this.mockData) return this.mockData;
    if (this.mockLoading) return this.mockLoading;

    const port = process.env.PORT ?? '3000';
    const url =
      process.env.BOARDING_PASS_MOCK_DATA_URL ??
      `http://localhost:${port}/mocks/oneway-onepax/boarding-pass`;

    this.mockLoading = firstValueFrom(this.http.get<BoardingPassApiResponse>(url))
      .then((res) => {
        this.mockData = res.data;
        return res.data;
      })
      .catch((err) => {
        this.mockLoading = undefined;
        throw err;
      });

    return this.mockLoading;
  }

  private async callUpstream(params: {
    url?: string;
    resourceId?: string;
    rawBody?: unknown;
    headers?: Partial<Record<string, string>>;
  }): Promise<BoardingPassApiResponse> {
    const mergedHeaders: Record<string, string> = {
      ...this.defaultHeaders,
      ...(params.headers ?? {}),
    };

    const url = params.url
      ? params.url
      : params.resourceId
        ? `${this.baseUrl}/${encodeURIComponent(params.resourceId)}`
        : this.baseUrl;

    const response$ =
      params.rawBody === undefined
        ? this.http.get<BoardingPassApiResponse>(url, {
            headers: mergedHeaders,
            timeout: 55_000,
          })
        : this.http.post<BoardingPassApiResponse>(url, params.rawBody, {
            headers: mergedHeaders,
            timeout: 55_000,
          });

    const { data } = await firstValueFrom(response$);
    return data;
  }
}
