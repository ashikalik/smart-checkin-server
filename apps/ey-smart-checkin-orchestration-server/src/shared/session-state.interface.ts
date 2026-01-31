import { BeginConversationState } from './begin-conversation-state';
import { CheckInState } from './checkin-state.enum';
import { JourneyIdentificationState } from './journey-identification-state.interface';
import { JourneySelectionState } from './journey-selection-state.interface';
import { PassengerIdentificationState } from './passenger-identification-state.interface';
import { PassengerSelectionState } from './passenger-selection-state.interface';
import { TripIdentificationState } from './trip-identification-state.interface';
import { TripSelectionState } from './trip-selection-state.interface';


export interface SessionState {
  sessionId: string;
  currentStage?: CheckInState;
  beginConversation?: BeginConversationState;
  tripIdentificationState?: TripIdentificationState;
  tripSelectionState?: TripSelectionState;
  journeyIdentificationState?: JourneyIdentificationState;
  journeySelectionState?: JourneySelectionState;
  passengerIdentificationState?: PassengerIdentificationState;
  passengerSelectionState?: PassengerSelectionState;
  lastStep?: string;
  data?: Record<string, unknown>;
}
