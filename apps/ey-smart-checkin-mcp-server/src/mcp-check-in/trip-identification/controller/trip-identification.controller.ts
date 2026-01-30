import { Controller, Post } from '@nestjs/common';
import { TripIdentificationService } from '../services/trip-identification.service';

@Controller('mcp-check-in/v1')
export class TripIdentificationController {
  constructor(private readonly tripIdentification: TripIdentificationService) {}

  @Post('trip-identification')
  async getBooking() {
    return this.tripIdentification.getBooking();
  }
}
