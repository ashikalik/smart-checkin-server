import type { JourneyTraveler } from '@etihad-core/models';
import type { BaseState } from './base-state.interface';

export interface PassengerSelectionState extends BaseState {
  selectedPassengers: JourneyTraveler[];
}
