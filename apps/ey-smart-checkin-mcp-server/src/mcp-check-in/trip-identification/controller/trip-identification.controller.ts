import { All, Body, Controller, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { TripIdentificationToolsService } from '../services/trip-identification.tools-service';

@Controller('mcp-check-in/v1/trip-identification')
export class TripIdentificationController {
  constructor(private readonly tripIdentificationTools: TripIdentificationToolsService) {}

  @All()
  async handleMcpRequest(
    @Req() req: Request,
    @Res() res: Response,
    @Body() body: unknown,
  ): Promise<void> {
    await this.tripIdentificationTools.handleRequest(req, res, body);
  }
}
