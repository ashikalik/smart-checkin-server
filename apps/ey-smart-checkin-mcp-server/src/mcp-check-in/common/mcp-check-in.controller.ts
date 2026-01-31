import { All, Body, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { McpCheckInToolsService } from './mcp-check-in.tools-service';

@Controller('mcp-check-in')
export class McpCheckInController {
  constructor(private readonly mcpCheckInTools: McpCheckInToolsService) {}

  @All()
  async handleMcpRequest(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: unknown,
  ): Promise<void> {
    await this.mcpCheckInTools.handleRequest(req, res, body);
  }
}
