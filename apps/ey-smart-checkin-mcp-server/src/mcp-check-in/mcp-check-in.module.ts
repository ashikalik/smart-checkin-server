import { Module } from '@nestjs/common';
import { TripIdentificationModule } from './trip-identification/trip-identification.module';
import { JourneyIdentificationMcpModule } from './journey-identification/journey-identification.module';
import { ValidateProcesscheckinModule } from './process-check-in/process-check-in.module';
import { CheckinAcceptanceModule } from './check-in-acceptance/checkin-acceptance.module';
import { BoardingPassModule } from './boarding-pass/boarding-pass.module';
import { BeginConversationModule } from './begin-conversation/begin-conversation.module';
import { McpCheckInController } from './common/mcp-check-in.controller';
import { McpCheckInToolsService } from './common/mcp-check-in.tools-service';
import { RegulatoryDetailsModule } from './regulatory-details/regulatory-details.module';

@Module({
  imports: [
    BeginConversationModule,
    TripIdentificationModule,
    JourneyIdentificationMcpModule,
    ValidateProcesscheckinModule,
    CheckinAcceptanceModule,
    BoardingPassModule,
    RegulatoryDetailsModule,
  ],
  controllers: [McpCheckInController],
  providers: [McpCheckInToolsService],
  exports: [
    BeginConversationModule,
    TripIdentificationModule,
    JourneyIdentificationMcpModule,
    ValidateProcesscheckinModule,
    CheckinAcceptanceModule,
    BoardingPassModule,
    RegulatoryDetailsModule,
  ],
})
export class McpCheckInModule {}
