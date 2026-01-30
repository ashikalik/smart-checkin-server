import type { Journey } from '@etihad-core/models';
import type { BaseState } from './base-state.interface';

export interface JourneySelectionState extends BaseState {
  selectedJourneyId: string;
  selectedJourney: Journey;
}
