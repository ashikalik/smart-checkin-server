import type { BaseState } from './base-state.interface';

export interface BeginConversationState extends BaseState {
  frequentFlyerNumber?: string;
  bookingReference?: string;
  lastName?: string;
  firstName?: string;
}
