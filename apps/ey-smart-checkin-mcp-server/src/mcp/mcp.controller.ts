import { Body, Controller, Req, Res, All } from '@nestjs/common';
import type { Request, Response } from 'express';

import { McpService } from './mcp.service';

@Controller('mcp')
export class McpController {
  constructor(private readonly mcp: McpService) {}

  @All()
  async handleMcpRequest(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: unknown,
  ): Promise<void> {
    await this.mcp.handleRequest(req, res, body);
  }
}
