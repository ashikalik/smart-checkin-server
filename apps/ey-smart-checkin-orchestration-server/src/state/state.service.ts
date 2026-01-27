import { Inject, Injectable } from '@nestjs/common';
import { OrchestratorState, STATE_STORE, StateStore } from './state-store.interface';

@Injectable()
export class StateService {
  constructor(@Inject(STATE_STORE) private readonly stateStore: StateStore) {}

  async getState(sessionId: string): Promise<OrchestratorState | undefined> {
    return this.stateStore.get(sessionId);
  }

  async saveState(sessionId: string, state: OrchestratorState, ttlSeconds?: number): Promise<void> {
    await this.stateStore.set(sessionId, state, ttlSeconds);
  }

  async updateState(
    sessionId: string,
    patch: Partial<OrchestratorState>,
    ttlSeconds?: number,
  ): Promise<OrchestratorState> {
    const current = (await this.stateStore.get(sessionId)) ?? { sessionId };
    const next = { ...current, ...patch };
    await this.stateStore.set(sessionId, next, ttlSeconds);
    return next;
  }

  async clearState(sessionId: string): Promise<void> {
    await this.stateStore.delete(sessionId);
  }
}
