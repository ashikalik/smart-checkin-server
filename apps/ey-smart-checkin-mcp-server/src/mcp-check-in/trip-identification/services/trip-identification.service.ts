import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

type TripIdentificationData = {
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
export class TripIdentificationService {
  private data?: TripIdentificationData;
  private loading?: Promise<TripIdentificationData>;

  constructor(private readonly http: HttpService) {}

  async getBooking(): Promise<TripIdentificationData> {
    return this.loadData();
  }

  async isValidFrequentFlyerCardNumber(value: string): Promise<boolean> {
    const data = await this.loadData();
    const expected = data?.data?.[0]?.frequentFlyerCardNumber;
    return Boolean(expected && expected === value);
  }

  async isValidLastName(value: string): Promise<boolean> {
    const data = await this.loadData();
    const expected = data?.data?.[0]?.travelers?.[0]?.names?.[0]?.lastName;
    return Boolean(expected && expected.toLowerCase() === value.trim().toLowerCase());
  }

  private async loadData(): Promise<TripIdentificationData> {
    if (this.data) {
      return this.data;
    }
    if (this.loading) {
      return this.loading;
    }
    const port = process.env.PORT ?? '3000';
    const url =
      process.env.TRIP_IDENTIFICATION_DATA_URL ?? `http://localhost:${port}/mocks/ffp-booking`;
    this.loading = firstValueFrom(this.http.get<TripIdentificationData>(url)).then((res) => {
      this.data = res.data;
      return res.data;
    });
    return this.loading;
  }
}
