import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';

import { FfpBookingSchema } from './schemas/ffp-booking.schema';
import { IdentificationSchema } from './schemas/identification.schema';
import { FfpBookingService } from './services/ffp-booking.service';
import { JourneyService } from './services/journey.service';

type ToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

type McpSession = {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
};

@Injectable()
export class McpCheckinService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(McpCheckinService.name);
  private readonly sessions = new Map<string, McpSession>();

  constructor(
    private readonly journey: JourneyService,
    private readonly ffpBooking: FfpBookingService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log('MCP check-in server started (streamable HTTP). Endpoint: /mcp-checkin');
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
      name: 'mcp-checkin',
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
      'identification',
      {
        description: 'Return journey data for a valid PNR',
        inputSchema: IdentificationSchema,
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
      async ({ pnr, lastName }) => {
        if (!this.journey.isValidPnr(pnr)) {
          return this.respondError('PNR not found');
        }
        if (!this.journey.isValidLastName(lastName)) {
          return this.respondError('Last name not found');
        }
        return this.respond(this.journey.getJourney());
      },
    );

    server.registerTool(
      'get_journey',
      {
        description: 'Return journey data for a valid PNR',
        inputSchema: IdentificationSchema,
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
      async ({ pnr, lastName }) => {
        if (!this.journey.isValidPnr(pnr)) {
          return this.respondError('PNR not found');
        }
        if (!this.journey.isValidLastName(lastName)) {
          return this.respondError('Last name not found');
        }
        return this.respond(this.journey.getJourney());
      },
    );

    server.registerTool(
      'get_ffp_booking',
      {
        description: 'Return FFP booking data',
        inputSchema: FfpBookingSchema,
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
      async ({ frequentFlyerCardNumber, lastName }) => {
        if (!this.ffpBooking.isValidFrequentFlyerCardNumber(frequentFlyerCardNumber)) {
          return this.respondError('Frequent flyer card number not found');
        }
        if (!this.ffpBooking.isValidLastName(lastName)) {
          return this.respondError('Last name not found');
        }
        return this.respond(this.ffpBooking.getBooking());
      },
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

  private respond(data: unknown): ToolResponse {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  private respondError(message: string): ToolResponse {
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: message,
        },
      ],
    };
  }
}
