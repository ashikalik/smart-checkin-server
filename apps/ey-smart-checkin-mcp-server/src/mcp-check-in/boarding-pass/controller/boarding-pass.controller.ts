import { Body, Controller, Req, Res, All } from '@nestjs/common';
import type { Request, Response } from 'express';
import { BoardingPassToolsService } from '../services/boarding-pass.tools-service';

@Controller('mcp-check-in/v1/boarding-pass')
export class BoardingPassController {
  constructor(private readonly tools: BoardingPassToolsService) {}

  @All()
  async handleMcpRequest(@Req() req: Request, @Res() res: Response, @Body() body: unknown) {
    await this.tools.handleRequest(req, res, body);
  }
}
