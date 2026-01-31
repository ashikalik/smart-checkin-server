import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TripIdentificationController } from './controller/trip-identification.controller';
import { TripIdentificationService } from './services/trip-identification.service';
import { TripIdentificationToolsService } from './services/trip-identification.tools-service';

@Module({
  imports: [HttpModule],
  controllers: [TripIdentificationController],
  providers: [TripIdentificationService, TripIdentificationToolsService],
  exports: [TripIdentificationService, TripIdentificationToolsService],
})
export class TripIdentificationModule {}
