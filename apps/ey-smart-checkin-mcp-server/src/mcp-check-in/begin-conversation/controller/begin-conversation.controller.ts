import { All, Body, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { BeginConversationToolsService } from '../services/begin-conversation.tools-service';

@Controller('mcp-check-in/v1/begin-conversation')
export class BeginConversationController {
  constructor(private readonly beginConversationTools: BeginConversationToolsService) {}

  @All()
  async handleMcpRequest(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: unknown,
  ): Promise<void> {
    await this.beginConversationTools.handleRequest(req, res, body);
  }
}
