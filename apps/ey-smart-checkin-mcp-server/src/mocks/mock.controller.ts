import { Controller, Get } from '@nestjs/common';

// make sure tsconfig has "resolveJsonModule": true
import journeyMock from './oneway-onepax/journey.json';
import ffpBooking from './ffp-booking.json';
import validateProcessCheckIn from './oneway-onepax/validate-process-checkin.json';
import checkinAcceptance from './oneway-onepax/checkin-acceptance.json';
import boardingPass from './oneway-onepax/boarding-pass.json';
import regulatoryDetails from './oneway-onepax/regulatory-details.json';

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

  @Get('oneway-onepax/checkin-acceptance')
  checkinAcceptanceMock() {
    return checkinAcceptance;
  }

  @Get('oneway-onepax/boarding-pass')
  boardingPassMock() {
    return boardingPass;
  }

  @Get('oneway-onepax/regulatory-details')
  regulatoryDetailsMock() {
    return regulatoryDetails;
  }
}
