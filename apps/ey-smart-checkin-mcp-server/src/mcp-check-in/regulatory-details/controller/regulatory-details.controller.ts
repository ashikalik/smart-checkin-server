import { Body, Controller, Req, Res, All } from '@nestjs/common';
import type { Request, Response } from 'express';
import { RegulatoryDetailsToolsService } from '../services/regulatory-details.tools-service';

@Controller('mcp-check-in/v1/regulatory-details')
export class RegulatoryDetailsController {
  constructor(private readonly tools: RegulatoryDetailsToolsService) {}

  @All()
  async handleMcpRequest(@Req() req: Request, @Res() res: Response, @Body() body: unknown) {
    await this.tools.handleRequest(req, res, body);
  }
}
