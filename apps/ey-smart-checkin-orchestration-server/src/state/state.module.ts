import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MemoryStateStoreService } from './memory-state-store.service';
import { StateService } from './state.service';
import { STATE_STORE, StateStore } from './state-store.interface';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'apps/ey-smart-checkin-orchestration-server/.env',
    }),
  ],
  providers: [
    {
      provide: STATE_STORE,
      inject: [ConfigService, MemoryStateStoreService],
      useFactory: (configService: ConfigService, memory: MemoryStateStoreService): StateStore => {
        const backend = configService.get<string>('MAIN_ORCHESTRATOR_STATE_STORE');
        if (!backend) {
          throw new Error('MAIN_ORCHESTRATOR_STATE_STORE is not set');
        }
        if (backend === 'memory') {
          return memory;
        }
        throw new Error(`Unsupported MAIN_ORCHESTRATOR_STATE_STORE: ${backend}`);
      },
    },
    MemoryStateStoreService,
    StateService,
  ],
  exports: [STATE_STORE, StateService],
})
export class StateModule {}
