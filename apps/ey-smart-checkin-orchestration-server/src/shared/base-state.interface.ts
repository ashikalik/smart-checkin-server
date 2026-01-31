
import type { StageStatus } from './stage-status.type';

export interface BaseState {
  status: StageStatus;
  continue: boolean;
  updatedAtUtc: string;
  startedAtUtc?: string;
  completedAtUtc?: string;
  lastEventId?: string;
  attempt?: number;
  error?: { code: string; message?: string; details?: unknown };
  userMessage?: string;
}
