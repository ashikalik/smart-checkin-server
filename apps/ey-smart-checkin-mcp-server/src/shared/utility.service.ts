import { Injectable } from '@nestjs/common';

@Injectable()
export class UtilityService {
  compactJson(value: unknown): string {
    return JSON.stringify(value);
  }
}
