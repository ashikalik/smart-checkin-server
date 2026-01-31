// apps/ey-smart-checkin-mcp-server/src/mcp-check-in/check-in-acceptance/controller/checkin-acceptance.controller.ts
import { Body, Controller, Req, Res, All } from '@nestjs/common';
import type { Request, Response } from 'express';
import { CheckinAcceptanceToolsService } from '../services/checkin-acceptance.tools-service';

@Controller('mcp-check-in/v1/checkin-acceptance')
export class CheckinAcceptanceController {
  constructor(private readonly tools: CheckinAcceptanceToolsService) {}

  @All()
  async handleMcpRequest(@Req() req: Request, @Res() res: Response, @Body() body: unknown) {
    await this.tools.handleRequest(req, res, body);
  }
}
