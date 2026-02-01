import { Body, Controller, Req, Res, All } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AncillaryCatalogueToolsService } from '../services/ancillary-catalogue.tools-service';

@Controller('mcp-check-in/v1/ancillary-catalogue')
export class AncillaryCatalogueController {
  constructor(private readonly tools: AncillaryCatalogueToolsService) {}

  @All()
  async handleMcpRequest(@Req() req: Request, @Res() res: Response, @Body() body: unknown) {
    await this.tools.handleRequest(req, res, body);
  }
}
