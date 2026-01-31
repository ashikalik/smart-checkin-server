import { Module } from '@nestjs/common';
import { BeginConversationController } from './controller/begin-conversation.controller';
import { BeginConversationToolsService } from './services/begin-conversation.tools-service';

@Module({
  controllers: [BeginConversationController],
  providers: [BeginConversationToolsService],
  exports: [BeginConversationToolsService],
})
export class BeginConversationModule {}
