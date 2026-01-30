import type { JourneysListReply } from '@etihad-core/models';
import type { BaseState } from './base-state.interface';

export interface JourneyIdentificationState extends BaseState {
  bookingReference: string;
  lastName: string;
  journeyReply: JourneysListReply;
}


