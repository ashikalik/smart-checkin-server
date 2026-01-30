import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TripIdentificationController } from './controller/trip-identification.controller';
import { TripIdentificationService } from './services/trip-identification.service';

@Module({
  imports: [HttpModule],
  controllers: [TripIdentificationController],
  providers: [TripIdentificationService],
  exports: [TripIdentificationService],
})
export class TripIdentificationModule {}
