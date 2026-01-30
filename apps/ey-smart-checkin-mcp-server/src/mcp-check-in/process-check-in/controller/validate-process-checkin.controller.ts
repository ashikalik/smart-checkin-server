// apps/ey-smart-checkin-mcp-server/src/mcp-checkin/validate-processcheckin/controller/validate-process-checkin.controller.ts
import { Body, Controller, Req, Res, All } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ValidateProcessCheckInToolsService } from '../services/validate-process-checkin.tools-service';

@Controller('mcp-check-in/v1/validate-processcheckin')
export class ValidateProcessCheckinController {
  constructor(private readonly tools: ValidateProcessCheckInToolsService) {}

  @All()
  async handleMcpRequest(@Req() req: Request, @Res() res: Response, @Body() body: unknown) {
    await this.tools.handleRequest(req, res, body);
  }
}
