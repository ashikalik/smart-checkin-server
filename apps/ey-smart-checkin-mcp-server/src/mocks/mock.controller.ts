import { Controller, Get } from '@nestjs/common';

// make sure tsconfig has "resolveJsonModule": true
import journeyMock from './oneway-onepax/journey.json';
import ffpBooking from './ffp-booking.json';
import validateProcessCheckIn from './oneway-onepax/validate-process-checkin.json';

@Controller('mocks')
export class MocksController {
  @Get('oneway-onepax/journey')
  getOnewayOnepaxJourney() {
    return journeyMock;
  }

  @Get('ffp-booking')
  ffpBooking() {
    return ffpBooking;
  }

  @Get('oneway-onepax/validate-process-checkin')
  validateProcessCheckIn() {
    return validateProcessCheckIn;
  }
}
