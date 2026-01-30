export type OrchestratorState = {
  sessionId: string;
  lastStep?: string;
  data?: Record<string, unknown>;
};

export type StateStore = {
  get(sessionId: string): Promise<OrchestratorState | undefined>;
  set(sessionId: string, state: OrchestratorState, ttlSeconds?: number): Promise<void>;
  delete(sessionId: string): Promise<void>;
};

export const STATE_STORE = Symbol('STATE_STORE');
