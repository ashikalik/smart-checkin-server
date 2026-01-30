import type { OrderPreview } from '@etihad-core/models';
import type { BaseState } from './base-state.interface';

export interface TripIdentificationState extends BaseState {
  selectedTrip: OrderPreview;
}
