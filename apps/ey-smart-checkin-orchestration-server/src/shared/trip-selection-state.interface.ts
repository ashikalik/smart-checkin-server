import type { OrderPreview } from '@etihad-core/models';
import type { BaseState } from './base-state.interface';

export interface TripSelectionState extends BaseState {
  ffpNumber?: string;
  lastName?: string;
  selectedTrip?: OrderPreview;
}
