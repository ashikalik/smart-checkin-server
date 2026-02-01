import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

import { isMockEnabled, maybeMockDelay } from '../../common/ssci-mock.util';

export type AncillaryCatalogueApiResponse = Record<string, unknown>;

@Injectable()
export class AncillaryCatalogueService {
  private readonly baseUrl =
    process.env.SSCI_ANCILLARY_CATALOGUE_BASE_URL ??
    'https://test2-digital.etihad.com/ada-services/ssci/ey-ssci-bff-ancillaries/ancillaries/v2/ancillary-catalogue';

  private readonly defaultHeaders = {
    'x-client-application': 'SSCI',
    'x-client-channel': 'WEB',
    'x-correlation-id': 'e5cdd169-e405-4386-b00c-a69832646ee9',
    'x-transaction-id': 'dbb9ec12-17f5-4fdb-9322-d13ebe73f3fe',
  } as const;

  private mockData?: AncillaryCatalogueApiResponse;
  private mockLoading?: Promise<AncillaryCatalogueApiResponse>;

  constructor(private readonly http: HttpService) {}

  async getAncillaryCatalogue(params: {
    url?: string;
    journeyId?: string;
    journeyElementId?: string;
    rawBody?: unknown;
    headers?: Partial<Record<string, string>>;
  }): Promise<AncillaryCatalogueApiResponse> {
    if (isMockEnabled()) {
      await maybeMockDelay();
      return this.getMock();
    }
    return this.callUpstream(params);
  }

  async getMock(): Promise<AncillaryCatalogueApiResponse> {
    return this.loadMockData();
  }

  private async loadMockData(): Promise<AncillaryCatalogueApiResponse> {
    if (this.mockData) return this.mockData;
    if (this.mockLoading) return this.mockLoading;

    const port = process.env.PORT ?? '3000';
    const url =
      process.env.ANCILLARY_CATALOGUE_MOCK_DATA_URL ??
      `http://localhost:${port}/mocks/oneway-onepax/ancillary-catalogue`;

    this.mockLoading = firstValueFrom(this.http.get<AncillaryCatalogueApiResponse>(url))
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
    journeyId?: string;
    journeyElementId?: string;
    rawBody?: unknown;
    headers?: Partial<Record<string, string>>;
  }): Promise<AncillaryCatalogueApiResponse> {
    const mergedHeaders: Record<string, string> = {
      ...this.defaultHeaders,
      ...(params.headers ?? {}),
    };

    const query =
      params.journeyId && params.journeyElementId
        ? `?journeyId=${encodeURIComponent(params.journeyId)}&journeyElementId=${encodeURIComponent(
            params.journeyElementId,
          )}`
        : '';

    const url = params.url ? params.url : `${this.baseUrl}${query}`;

    const response$ = this.http.post<AncillaryCatalogueApiResponse>(url, params.rawBody ?? {}, {
      headers: mergedHeaders,
      timeout: 55_000,
    });

    const { data } = await firstValueFrom(response$);
    return data;
  }
}
