import type { BaseState } from './base-state.interface';
import type { CheckInState } from './checkin-state.enum';

export type StageResponse = BaseState & {
  sessionId: string;
  stage: CheckInState;
  steps?: unknown;
};
