import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

import type { JourneyIdentificationRequestPayload, JourneysListReply } from '@etihad-core/models';

type Derived = {
  travelerIds: string[];
  travelerIdsByJourney: Record<string, string[]>;
};

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

  // ✅ cache for MOCK data (same pattern as TripIdentificationService)
  private mockData?: JourneysListReply;
  private mockLoading?: Promise<JourneysListReply>;

  constructor(private readonly httpService: HttpService) {}

  async fetchJourneyIdentification(
    payload: JourneyIdentificationRequestPayload,
    headers?: Partial<Record<string, string>>,
  ): Promise<JourneysListReply> {
    const mergedHeaders: Record<string, string> = {
      ...this.defaultHeaders,
      ...(headers ?? {}),
    };

    const response$ = this.httpService.post<JourneysListReply>(this.endpointUrl, payload, {
      headers: mergedHeaders,
      timeout: 55_000,
    });

    const { data } = await firstValueFrom(response$);
    return data;
  }

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

  /**
   * Tool-friendly method:
   * - Runs MOCK if enabled
   * - Else calls upstream
   * - Always returns { ...apiRes, derived }
   */
  async getJourney(
    payload: JourneyIdentificationRequestPayload,
    headerOverrides?: Partial<Record<string, string>>,
  ): Promise<JourneysListReply & { derived: Derived }> {
    const apiRes = this.isMockEnabled()
      ? await this.getMockJourney(payload.identifier, payload.lastName)
      : await this.fetchJourneyIdentification(payload, headerOverrides);

    return {
      ...apiRes,
      derived: {
        travelerIds: this.extractAllTravelerIds(apiRes),
        travelerIdsByJourney: this.extractTravelerIdsByJourney(apiRes),
      },
    };
  }

  // -------------------------
  // MOCK helpers
  // -------------------------

  isMockEnabled(): boolean {
    // set MOCK_SSCI=true to enable
    //return String(process.env.MOCK_SSCI ?? '').toLowerCase() === 'true';
    // if you still want always-mock during dev:
 return true;
  }

  private async getMockJourney(identifier: string, lastName: string): Promise<JourneysListReply> {
    await this.maybeMockDelay();
    const base = await this.loadMockData();
    return this.patchMockJourney(base, identifier, lastName);
  }

  private async maybeMockDelay(): Promise<void> {
    const ms = Number(process.env.MOCK_SSCI_DELAY_MS ?? 0);
    if (Number.isFinite(ms) && ms > 0) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    }
  }

  private deepClone<T>(obj: T): T {
    // structuredClone is available in Node 17+ (and some earlier with flags)
    // fallback to JSON clone for plain data objects
    const sc = (globalThis as any).structuredClone as ((x: any) => any) | undefined;
    if (typeof sc === 'function') return sc(obj);
    return JSON.parse(JSON.stringify(obj)) as T;
  }

  /**
   * ✅ Load mock data via HTTP once and cache it
   * Similar to TripIdentificationService.loadData()
   */
  private async loadMockData(): Promise<JourneysListReply> {
    if (this.mockData) return this.mockData;
    if (this.mockLoading) return this.mockLoading;

    const port = process.env.PORT ?? '3000';
    const url =
      process.env.SSCI_JOURNEY_MOCK_DATA_URL ??
      `http://localhost:${port}/mocks/oneway-onepax/journey`;

    this.mockLoading = firstValueFrom(this.httpService.get<JourneysListReply>(url))
      .then((res) => {
        this.mockData = res.data;
        return res.data;
      })
      .catch((err) => {
        // IMPORTANT: allow retry on next call
        this.mockLoading = undefined;
        throw err;
      });

    return this.mockLoading;
  }

  /**
   * Patch identifier (PNR) + traveler lastName in a cloned copy.
   */
  private patchMockJourney(
    base: JourneysListReply,
    identifier: string,
    lastName: string,
  ): JourneysListReply {
    const fixture = this.deepClone(base);

    if (fixture.journeys?.[0]?.id && String(fixture.journeys[0].id).startsWith('MOCK-')) {
      fixture.journeys[0].id = `MOCK-${identifier}`;
    }

    for (const j of fixture.journeys ?? []) {
      for (const t of j.travelers ?? []) {
        for (const n of t.names ?? []) {
          if (n && typeof n === 'object') {
            (n as any).lastName = lastName;
          }
        }
      }
    }

    return fixture;
  }

  // -------------------------
  // Derived helpers
  // -------------------------

  private extractTravelerIdsByJourney(apiRes: JourneysListReply): Record<string, string[]> {
    const out: Record<string, string[]> = {};

    for (const j of apiRes.journeys ?? []) {
      const journeyId = String((j as any)?.id ?? '');
      if (!journeyId) continue;

      const ids = new Set<string>();

      for (const t of (j as any)?.travelers ?? []) {
        const id = (t as any)?.id;
        if (typeof id === 'string' && id.length > 0) ids.add(id);
      }

      out[journeyId] = Array.from(ids);
    }

    return out;
  }

  private extractAllTravelerIds(apiRes: JourneysListReply): string[] {
    const byJourney = this.extractTravelerIdsByJourney(apiRes);
    const all = new Set<string>();
    for (const ids of Object.values(byJourney)) {
      for (const id of ids) all.add(id);
    }
    return Array.from(all);
  }
}
