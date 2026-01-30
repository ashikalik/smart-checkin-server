export type StageStatus = 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export interface StageMeta {
  status: StageStatus;
  updatedAtUtc: string;
  startedAtUtc?: string;
  completedAtUtc?: string;
  lastEventId?: string;
  attempt?: number;
  error?: { code: string; message?: string; details?: unknown };
}
