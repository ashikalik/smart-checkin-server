import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response } from 'express';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

import {
  SsciJourneyIdentificationService,
  ssciIdentificationJourneyMcpTool,
} from './tools/retrieve-journey.tool';
import { SsciRetrieveOrderGqlService, ssciRetrieveOrderGqlMcpTool } from './tools/retrieve-order.tool';
import { ssciIdentificationJourneyEligibilityMcpTool } from './tools/journey-eligibility.tool';
import { ssciProcessCheckinMcpTool, SsciProcessCheckinService } from './auto-checkin-tools/process-acceptance.tool';
import { SsciRegulatoryContactService, ssciRegulatoryContactUpdateMcpTool } from './auto-checkin-tools/regulatory-contact.service';
import { ssciRegulatoryDetailsMcpTool, SsciRegulatoryDetailsService } from './auto-checkin-tools/regulatory-get.tool';
import { ssciRegulatoryDetailsUpdateMcpTool, SsciRegulatoryDetailsUpdateService } from './auto-checkin-tools/regulatory-update.tool';
import { SsciFlightStatusService, ssciFlightStatusMcpTool } from './tools/flight-status.tool';

type McpSession = {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
};

@Injectable()
export class McpCheckInService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(McpCheckInService.name);
  private readonly sessions = new Map<string, McpSession>();

  constructor(
    private readonly journey: SsciJourneyIdentificationService,
    private readonly order: SsciRetrieveOrderGqlService,
    private readonly processCheckin: SsciProcessCheckinService,
    private readonly regulatoryDetails: SsciRegulatoryDetailsService,
    private readonly regulatoryDetailsUpdate: SsciRegulatoryDetailsUpdateService,
    private readonly regulatoryContact: SsciRegulatoryContactService,
    private readonly flightStatus: SsciFlightStatusService,

  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('MCP server started (streamable HTTP). Endpoint: /mcp-checkin');
  }

  async onModuleDestroy(): Promise<void> {
    const transports = Array.from(this.sessions.values()).map((session) => session.transport);
    await Promise.all(transports.map((transport) => transport.close()));
  }

  async handleRequest(req: Request, res: Response, body?: unknown): Promise<void> {
    const sessionId = this.getSessionId(req);
    if (sessionId && this.sessions.has(sessionId)) {
      await this.sessions.get(sessionId)!.transport.handleRequest(req, res, body);
      return;
    }

    if (!sessionId && this.isInitializeRequest(body)) {
      const session = this.createSession();
      await session.server.connect(session.transport);
      await session.transport.handleRequest(req, res, body);
      return;
    }

    res.status(400).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: sessionId
          ? 'Bad Request: Unknown MCP session. Reinitialize.'
          : 'Bad Request: Missing MCP session. Send initialize request first.',
      },
      id: null,
    });
  }

  private createSession(): McpSession {
    const server = new McpServer({
      name: 'nest-mcp-ssci',
      version: '1.0.0',
    });
    this.registerTools(server);

    const session: McpSession = {
      server,
      transport: new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          this.sessions.set(sessionId, session);
          this.logger.log(`MCP session initialized: ${sessionId}`);
        },
      }),
    };

    session.transport.onclose = () => {
      const sid = session.transport.sessionId;
      if (sid && this.sessions.has(sid)) {
        this.sessions.delete(sid);
        this.logger.log(`MCP session closed: ${sid}`);
      }
    };

    return session;
  }

  private registerTools(server: McpServer): void {
    server.registerTool(
      ssciIdentificationJourneyMcpTool.name,
      ssciIdentificationJourneyMcpTool.definition,
      ssciIdentificationJourneyMcpTool.handler(this.journey),
    );
   
    server.registerTool(
      ssciIdentificationJourneyEligibilityMcpTool.name,
      ssciIdentificationJourneyEligibilityMcpTool.definition,
      ssciIdentificationJourneyEligibilityMcpTool.handler(this.journey),
    );
   
    server.registerTool(
      ssciRetrieveOrderGqlMcpTool.name,
      ssciRetrieveOrderGqlMcpTool.definition,
      ssciRetrieveOrderGqlMcpTool.handler(this.order),
    );
   
    server.registerTool(
      ssciProcessCheckinMcpTool.name,
      ssciProcessCheckinMcpTool.definition,
      ssciProcessCheckinMcpTool.handler(this.processCheckin),
    );
   
    server.registerTool(
      ssciRegulatoryDetailsMcpTool.name,
      ssciRegulatoryDetailsMcpTool.definition,
      ssciRegulatoryDetailsMcpTool.handler(this.regulatoryDetails),
    );
   
    server.registerTool(
      ssciRegulatoryDetailsUpdateMcpTool.name,
      ssciRegulatoryDetailsUpdateMcpTool.definition,
      ssciRegulatoryDetailsUpdateMcpTool.handler(this.regulatoryDetailsUpdate),
    );
   
    server.registerTool(
      ssciRegulatoryContactUpdateMcpTool.name,
      ssciRegulatoryContactUpdateMcpTool.definition,
      ssciRegulatoryContactUpdateMcpTool.handler(this.regulatoryContact),
    );
      server.registerTool(
      ssciFlightStatusMcpTool.name,
      ssciFlightStatusMcpTool.definition,
      ssciFlightStatusMcpTool.handler(this.flightStatus),
);


  }

  private getSessionId(req: Request): string | undefined {
    const header = req.headers['mcp-session-id'];
    if (Array.isArray(header)) {
      return header[0];
    }
    return header;
  }

  private isInitializeRequest(body?: unknown): boolean {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return false;
    }
    const method = (body as { method?: string }).method;
    return method === 'initialize';
  }

  // Tool response formatting is handled inside each exported MCP tool.
}
