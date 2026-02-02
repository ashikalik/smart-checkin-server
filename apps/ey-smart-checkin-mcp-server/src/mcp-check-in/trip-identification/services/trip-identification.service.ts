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
  private mockData?: TripIdentificationData;
  private mockLoading?: Promise<TripIdentificationData>;
  private realData?: TripIdentificationData;
  private realLoading?: Promise<TripIdentificationData>;

  constructor(private readonly http: HttpService) {}

  async getBooking(useMock?: boolean): Promise<TripIdentificationData> {
    return this.loadData(useMock);
  }

  async isValidFrequentFlyerCardNumber(value: string, useMock?: boolean): Promise<boolean> {
    const data = await this.loadData(useMock);
    const expected = data?.data?.[0]?.frequentFlyerCardNumber;
    return Boolean(expected && expected === value);
  }

  async isValidLastName(value: string, useMock?: boolean): Promise<boolean> {
    const data = await this.loadData(useMock);
    const expected = data?.data?.[0]?.travelers?.[0]?.names?.[0]?.lastName;
    return Boolean(expected && expected.toLowerCase() === value.trim().toLowerCase());
  }

  private async loadData(useMock?: boolean): Promise<TripIdentificationData> {
    const port = process.env.PORT ?? '3000';
    const mockUrl =
      process.env.TRIP_IDENTIFICATION_MOCK_DATA_URL ??
      `http://localhost:${port}/mocks/ffp-booking`;
    const realUrl = process.env.TRIP_IDENTIFICATION_DATA_URL ?? mockUrl;
    const useReal = useMock === false;

    if (useReal) {
      if (this.realData) return this.realData;
      if (this.realLoading) return this.realLoading;
      this.realLoading = firstValueFrom(this.http.get<TripIdentificationData>(realUrl)).then(
        (res) => {
          this.realData = res.data;
          return res.data;
        },
      );
      return this.realLoading;
    }

    if (this.mockData) return this.mockData;
    if (this.mockLoading) return this.mockLoading;
    this.mockLoading = firstValueFrom(this.http.get<TripIdentificationData>(mockUrl)).then(
      (res) => {
        this.mockData = res.data;
        return res.data;
      },
    );
    return this.mockLoading;
  }
}
