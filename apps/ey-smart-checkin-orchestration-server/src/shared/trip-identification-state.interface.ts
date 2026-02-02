import type { OrderPreviewsListReply } from '@etihad-core/models';
import type { BaseState } from './base-state.interface';

export interface TripIdentificationState extends BaseState {
  orderPreviewsListReply?: OrderPreviewsListReply;
  userConfirmation?: boolean | string;
  selectedPnr?: string;
  choices?: string[];
  recommendedPnr?: string;
  missing?: string[];
}
