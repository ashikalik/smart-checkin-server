

import { Body, Controller, Req, Res, All } from '@nestjs/common';
import type { Request, Response } from 'express';
import { JourneyIdentificationToolsService } from '../services/journey-identification.tools-services';


@Controller('mcp-check-in/v1/journey-identification')
export class JourneyIdentificationController {
  constructor(
              private readonly journeyIdentificationTools: JourneyIdentificationToolsService
  ) {}

  @All()
  async handleMcpRequest(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: unknown,
  ): Promise<void> {
    await this.journeyIdentificationTools.handleRequest(req, res, body);
  }
}


  