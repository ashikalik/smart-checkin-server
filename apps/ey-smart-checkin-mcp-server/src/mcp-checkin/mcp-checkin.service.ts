import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Request, Response } from 'express';

import { FfpBookingSchema } from './schemas/ffp-booking.schema';
import { IdentificationSchema } from './schemas/identification.schema';
import { SelectBookingSchema } from './schemas/select-booking.schema';
import { FfpBookingService } from './services/ffp-booking.service';
import { JourneyService } from './services/journey.service';
import { UtilityService } from '../shared/utility.service';
import { TripIdentificationService } from '../mcp-check-in/trip-identification/services/trip-identification.service';
import { tripIdentificationMcpTool } from '../mcp-check-in/trip-identification/tools/trip-identification.tool';

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
    private readonly utilityService: UtilityService,
    private readonly tripIdentification: TripIdentificationService,
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
      'select_booking',
      {
        description: 'Resolve a booking choice from a user utterance and a list of choices.',
        inputSchema: SelectBookingSchema,
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
      async ({ utterance, choices }) => {
        const bookingId = this.resolveBookingChoice(utterance, choices);
        return this.respond({ bookingId });
      },
    );

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
        if (!(await this.ffpBooking.isValidFrequentFlyerCardNumber(frequentFlyerCardNumber))) {
          return this.respondError('Frequent flyer card number not found');
        }
        if (!(await this.ffpBooking.isValidLastName(lastName))) {
          return this.respondError('Last name not found');
        }
        return this.respond(await this.ffpBooking.getBooking());
      },
    );

    server.registerTool(
      'get_trips_from_ffp_booking',
      {
        description: 'Return trips extracted from FFP booking data',
        inputSchema: FfpBookingSchema,
        annotations: { readOnlyHint: true, idempotentHint: true },
      },
      async ({ frequentFlyerCardNumber, lastName }) => {
        if (!(await this.ffpBooking.isValidFrequentFlyerCardNumber(frequentFlyerCardNumber))) {
          return this.respondError('Frequent flyer card number not found');
        }
        if (!(await this.ffpBooking.isValidLastName(lastName))) {
          return this.respondError('Last name not found');
        }

        const booking = (await this.ffpBooking.getBooking()) as { data?: Array<Record<string, unknown>> };
        const trips = Array.isArray(booking.data)
          ? booking.data.map((trip) => ({
              id: trip.id,
              creationDateTime: trip.creationDateTime,
              flights: trip.flights,
            }))
          : [];

        return this.respond({ trips });
      },
    );

    server.registerTool(
      tripIdentificationMcpTool.name,
      tripIdentificationMcpTool.definition,
      tripIdentificationMcpTool.handler(this.tripIdentification),
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
          text: this.utilityService.compactJson(data),
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

  private resolveBookingChoice(
    utterance: string,
    choices: Array<{ id: string; summary?: string }>,
  ): string | null {
    const normalized = utterance.trim().toLowerCase();
    if (!normalized) {
      return null;
    }

    const idMatch = choices.find((choice) => normalized.includes(choice.id.toLowerCase()));
    if (idMatch) {
      return idMatch.id;
    }

    if (this.matchesOrdinal(normalized, 1)) {
      return choices[0]?.id ?? null;
    }
    if (this.matchesOrdinal(normalized, 2)) {
      return choices[1]?.id ?? null;
    }

    const codeMatch = this.matchByLocationCode(normalized, choices);
    if (codeMatch) {
      return codeMatch;
    }

    return null;
  }

  private matchesOrdinal(utterance: string, ordinal: number): boolean {
    const patterns =
      ordinal === 1
        ? ['first', '1st', 'one', '1']
        : ordinal === 2
          ? ['second', '2nd', 'two', '2']
          : [];
    return patterns.some((token) => utterance.includes(token));
  }

  private matchByLocationCode(utterance: string, choices: Array<{ id: string; summary?: string }>): string | null {
    const aliases: Record<string, string> = {
      bombay: 'BOM',
      mumbai: 'BOM',
      ahmedabad: 'AMD',
      'abu dhabi': 'AUH',
      abudhabi: 'AUH',
      paris: 'CDG',
    };

    const tokens = Object.keys(aliases).filter((key) => utterance.includes(key));
    const codes = new Set<string>();
    for (const token of tokens) {
      codes.add(aliases[token]);
    }
    const codeTokens = utterance.match(/[A-Z]{3}/g) ?? [];
    codeTokens.forEach((code) => codes.add(code.toUpperCase()));

    if (codes.size === 0) {
      return null;
    }

    const matches = choices.filter((choice) => {
      const summary = choice.summary?.toUpperCase() ?? '';
      for (const code of codes) {
        if (summary.includes(code)) {
          return true;
        }
      }
      return false;
    });

    if (matches.length === 1) {
      return matches[0].id;
    }
    return null;
  }
}
