import { Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { McpCheckinService } from './mcp-checkin.service';

@Controller('mcp-checkin')
export class McpCheckinController {
  constructor(private readonly mcp: McpCheckinService) {}

  @Post()
  async handle(@Req() req: Request, @Res() res: Response, @Body() body?: unknown) {
    await this.mcp.handleRequest(req, res, body);
  }
}
