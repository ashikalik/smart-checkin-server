import type { SessionState } from '../shared/session-state.interface';

export type OrchestratorState = SessionState;

export type StateStore = {
  get(sessionId: string): Promise<SessionState | undefined>;
  set(sessionId: string, state: SessionState, ttlSeconds?: number): Promise<void>;
  delete(sessionId: string): Promise<void>;
};

export const STATE_STORE = Symbol('STATE_STORE');
