import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

import { isMockEnabled, maybeMockDelay } from '../../common/ssci-mock.util';

export type RegulatoryDetailsApiResponse = {
  data?: {
    journeyElementIds?: string[];
    missingDetails?: Array<{
      detailsCategory?: string;
      detailsChoices?: Array<{
        canBeDeclined?: boolean;
        detailsType?: string;
        regulatoryType?: string;
        requiredDetailsFields?: string[];
      }>;
      isOptional?: boolean;
    }>;
    statusCleared?: boolean;
    storedDetails?: Array<Record<string, unknown>>;
    travelerId?: string;
  };
  dictionaries?: Record<string, unknown>;
};

@Injectable()
export class RegulatoryDetailsService {
  private readonly baseUrl =
    process.env.SSCI_REGULATORY_DETAILS_BASE_URL ??
    'https://test-digital.etihad.com/ada-services/ssci/ey-ssci-bff-checkin/regulatory-details/v1';

  private readonly defaultHeaders = {
    'x-client-application': 'SSCI',
    'x-client-channel': 'WEB',
    'x-correlation-id': 'e5cdd169-e405-4386-b00c-a69832646ee9',
    'x-transaction-id': 'dbb9ec12-17f5-4fdb-9322-d13ebe73f3fe',
  } as const;

  private mockData?: RegulatoryDetailsApiResponse;
  private mockLoading?: Promise<RegulatoryDetailsApiResponse>;

  constructor(private readonly http: HttpService) {}

  async getRegulatoryDetails(params: {
    url?: string;
    id?: string;
    travelerId?: string;
    headers?: Partial<Record<string, string>>;
    useMock?: boolean;
  }): Promise<RegulatoryDetailsApiResponse> {
    if (isMockEnabled(params.useMock)) {
      await maybeMockDelay();
      return this.getMock();
    }
    return this.callUpstream(params);
  }

  async updateRegulatoryDetails(params: {
    url?: string;
    id?: string;
    travelerId?: string;
    rawBody?: unknown;
    headers?: Partial<Record<string, string>>;
    useMock?: boolean;
  }): Promise<unknown> {
    if (isMockEnabled(params.useMock)) {
      await maybeMockDelay();
      return this.getUpdateMock();
    }
    return this.callUpdateUpstream(params);
  }

  async getMock(): Promise<RegulatoryDetailsApiResponse> {
    return this.loadMockData();
  }

  async getUpdateMock(): Promise<unknown> {
    return this.loadUpdateMockData();
  }

  private async loadMockData(): Promise<RegulatoryDetailsApiResponse> {
    if (this.mockData) return this.mockData;
    if (this.mockLoading) return this.mockLoading;

    const port = process.env.PORT ?? '3000';
    const url =
      process.env.REGULATORY_DETAILS_MOCK_DATA_URL ??
      `http://localhost:${port}/mocks/oneway-onepax/regulatory-details`;

    this.mockLoading = firstValueFrom(this.http.get<RegulatoryDetailsApiResponse>(url))
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

  private async loadUpdateMockData(): Promise<unknown> {
    const port = process.env.PORT ?? '3000';
    const url =
      process.env.REGULATORY_DETAILS_UPDATE_MOCK_DATA_URL ??
      `http://localhost:${port}/mocks/oneway-onepax/regulatory-details-update`;
    const { data } = await firstValueFrom(this.http.get<unknown>(url));
    return data;
  }

  private async callUpstream(params: {
    url?: string;
    id?: string;
    travelerId?: string;
    headers?: Partial<Record<string, string>>;
  }): Promise<RegulatoryDetailsApiResponse> {
    const mergedHeaders: Record<string, string> = {
      ...this.defaultHeaders,
      ...(params.headers ?? {}),
    };

    const url = params.url
      ? params.url
      : params.id && params.travelerId
        ? `${this.baseUrl}/${encodeURIComponent(params.id)}/travelers/${encodeURIComponent(
            params.travelerId,
          )}`
        : this.baseUrl;

    const response$ = this.http.get<RegulatoryDetailsApiResponse>(url, {
      headers: mergedHeaders,
      timeout: 55_000,
    });

    const { data } = await firstValueFrom(response$);
    return data;
  }

  private async callUpdateUpstream(params: {
    url?: string;
    id?: string;
    travelerId?: string;
    rawBody?: unknown;
    headers?: Partial<Record<string, string>>;
  }): Promise<unknown> {
    const mergedHeaders: Record<string, string> = {
      ...this.defaultHeaders,
      ...(params.headers ?? {}),
    };

    const url = params.url
      ? params.url
      : params.id && params.travelerId
        ? `${this.baseUrl}/${encodeURIComponent(params.id)}/travelers/${encodeURIComponent(
            params.travelerId,
          )}`
        : this.baseUrl;

    const response$ = this.http.post<unknown>(url, params.rawBody ?? {}, {
      headers: mergedHeaders,
      timeout: 55_000,
    });

    const { data } = await firstValueFrom(response$);
    return data;
  }
}
