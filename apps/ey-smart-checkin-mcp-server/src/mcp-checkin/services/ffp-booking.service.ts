import { Injectable } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';

type FfpBookingData = {
  data?: Array<{
    id?: string;
    frequentFlyerCardNumber?: string;
    travelers?: Array<{
      names?: Array<{
        lastName?: string;
      }>;
    }>;
  }>;
};

@Injectable()
export class FfpBookingService {
  private readonly data: FfpBookingData;

  constructor() {
    const filePath = join(process.cwd(), 'apps/ey-smart-checkin-mcp-server/mocks/ffp-booking.json');
    const raw = readFileSync(filePath, 'utf8');
    this.data = JSON.parse(raw) as FfpBookingData;
  }

  getBooking(): FfpBookingData {
    return this.data;
  }

  isValidFrequentFlyerCardNumber(value: string): boolean {
    const expected = this.data?.data?.[0]?.frequentFlyerCardNumber;
    return Boolean(expected && expected === value);
  }

  isValidLastName(value: string): boolean {
    const expected = this.data?.data?.[0]?.travelers?.[0]?.names?.[0]?.lastName;
    return Boolean(expected && expected.toLowerCase() === value.trim().toLowerCase());
  }
}
