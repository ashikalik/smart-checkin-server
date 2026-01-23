import { Body, Controller, Req, Res, All } from '@nestjs/common';
import type { Request, Response } from 'express';

import { McpCheckInService } from './checkin-mcp.service'

@Controller('mcp-checkin')
export class McpCheckInController {
  constructor(private readonly mcp: McpCheckInService) {}

  @All()
  async handleMcpRequest(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: unknown,
  ): Promise<void> {
    await this.mcp.handleRequest(req, res, body);
  }
}
