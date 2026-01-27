import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';

type JourneyData = {
  journeys?: Array<{
    journeyElements?: Array<{
      orderId?: string;
    }>;
    travelers?: Array<{
      names?: Array<{
        lastName?: string;
      }>;
    }>;
  }>;
};

@Injectable()
export class JourneyService {
  private readonly data: JourneyData;

  constructor() {
    const filePath = join(process.cwd(), 'apps/ey-smart-checkin-mcp-server/mocks/journey.json');
    const raw = readFileSync(filePath, 'utf8');
    this.data = JSON.parse(raw) as JourneyData;
  }

  isValidPnr(pnr: string): boolean {
    return this.findOrderIds().has(pnr);
  }

  isValidLastName(lastName: string): boolean {
    const normalized = this.normalize(lastName);
    if (!normalized) {
      return false;
    }
    return this.findLastNames().has(normalized);
  }

  getJourney(): JourneyData {
    return this.data;
  }

  private findOrderIds(): Set<string> {
    const ids = new Set<string>();
    for (const journey of this.data.journeys ?? []) {
      for (const element of journey.journeyElements ?? []) {
        if (element.orderId) {
          ids.add(element.orderId);
        }
      }
    }
    return ids;
  }

  private findLastNames(): Set<string> {
    const names = new Set<string>();
    for (const journey of this.data.journeys ?? []) {
      for (const traveler of journey.travelers ?? []) {
        for (const name of traveler.names ?? []) {
          if (name.lastName) {
            names.add(this.normalize(name.lastName));
          }
        }
      }
    }
    return names;
  }

  private normalize(value: string): string {
    return value.trim().toLowerCase();
  }
}
