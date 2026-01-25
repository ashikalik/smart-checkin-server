import { Module } from '@nestjs/common';
import { OutputFormatterService } from './output-formatter.service';

@Module({
  providers: [OutputFormatterService],
  exports: [OutputFormatterService],
})
export class OutputFormatterModule {}
