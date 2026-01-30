import { Controller, Get } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';

@Controller('mocks')
export class FfpBookingMockController {
  @Get('ffp-booking')
  getMock() {
    const filePath = join(process.cwd(), 'apps/ey-smart-checkin-mcp-server/mocks/ffp-booking.json');
    const raw = readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as unknown;
  }
}
