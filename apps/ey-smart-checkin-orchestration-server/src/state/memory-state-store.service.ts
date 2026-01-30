import { Injectable } from '@nestjs/common';
import { OrchestratorState, StateStore } from './state-store.interface';

type StoredState = {
  state: OrchestratorState;
  expiresAt?: number;
};

@Injectable()
export class MemoryStateStoreService implements StateStore {
  private readonly store = new Map<string, StoredState>();

  async get(sessionId: string): Promise<OrchestratorState | undefined> {
    const entry = this.store.get(sessionId);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      this.store.delete(sessionId);
      return undefined;
    }
    return entry.state;
  }

  async set(sessionId: string, state: OrchestratorState, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.store.set(sessionId, { state, expiresAt });
  }

  async delete(sessionId: string): Promise<void> {
    this.store.delete(sessionId);
  }
}
