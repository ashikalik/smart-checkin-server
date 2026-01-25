import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ArithmeticOrchestratorModule } from '../orchestrator/arithmetic-orchestrator.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'apps/ey-smart-checkin-orchestration-server/.env',
    }),
    ArithmeticOrchestratorModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
