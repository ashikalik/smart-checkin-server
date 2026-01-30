import type { JourneyTraveler } from '@etihad-core/models';
import type { BaseState } from './base-state.interface';

export interface PassengerIdentificationState extends BaseState {
  eligiblePassengers: JourneyTraveler[];
}
