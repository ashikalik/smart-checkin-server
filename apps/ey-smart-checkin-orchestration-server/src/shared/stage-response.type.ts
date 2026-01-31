import type { BaseState } from './base-state.interface';
export type StageResponse = BaseState & {
  sessionId: string;
  stage: string;
  steps?: unknown;
};
