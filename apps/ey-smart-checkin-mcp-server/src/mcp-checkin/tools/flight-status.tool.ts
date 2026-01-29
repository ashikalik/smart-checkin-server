// apps/ey-smart-checkin-mcp-server/src/mcp-checkin/tools/flight-status.tool.ts

import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { z } from 'zod';

type McpToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

function toToolResponse(data: unknown, isError = false): McpToolResponse {
  return {
    isError,
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Tool input schema (Zod)
 * Must be Zod because McpServer.registerTool expects AnySchema | ZodRawShapeCompat for inputSchema.
 */
export const SsciFlightStatusSchema = z.object({
  flights: z
    .array(
      z.object({
        carrier: z.string().min(1),
        flightNumber: z.string().min(1),
        departureDate: z.string().min(1), // YYYY-MM-DD
        origin: z.string().min(3),
        destination: z.string().min(3),
        language: z.string().optional(),
      }),
    )
    .min(1),

  /**
   * Optional header overrides.
   * NOTE: In JS objects, header keys are case-insensitive for HTTP, but we keep them in lowercase for consistency.
   */
  headers: z
    .object({
      'x-correlation-id': z.string().optional(),
      'x-transaction-id': z.string().optional(),
      'x-client-application': z.string().optional(),
      'x-client-channel': z.string().optional(),
      'x-ey-oid': z.string().optional(),
      authorization: z.string().optional(), // optional: useful if gateway requires bearer token
      cookie: z.string().optional(), // optional: useful in lower envs (not recommended for prod)
    })
    .optional()
    .describe('Optional header overrides. Values here override defaults.'),
});

export type SsciFlightStatusToolInput = z.infer<typeof SsciFlightStatusSchema>;

@Injectable()
export class SsciFlightStatusService {
  private readonly logger = new Logger(SsciFlightStatusService.name);

  constructor(private readonly httpService: HttpService) {}

  async getFlightStatus(
    flights: SsciFlightStatusToolInput['flights'],
    headerOverrides?: SsciFlightStatusToolInput['headers'],
  ) {
    const url =
      'https://test-digital.etihad.com' +
      '/ada-services/ssci/ey-ssci-bff-order/flight-status/v1/flight-status/get';

    const headers = {
      'content-type': 'application/json',
      'x-client-application': 'SSCI',
      'x-client-channel': 'WEB',
      'x-ey-oid': 'test-ada',
      ...(headerOverrides ?? {}),
    };

    // Useful for debugging in lower envs: shows what we’re sending (without dumping cookies/tokens)
    this.logger.debug(
      `Calling flight-status BFF. flights=${flights?.length ?? 0} correlation=${headers['x-correlation-id'] ?? ''} txn=${headers['x-transaction-id'] ?? ''}`,
    );

    const response = await firstValueFrom(
      this.httpService.post(url, flights, {
        headers,
        timeout: 15000,
        // validateStatus keeps Axios from throwing on 4xx/5xx if you prefer handling based on status.
        // If you want to keep throw-on-non-2xx behavior, remove validateStatus.
        validateStatus: () => true,
      }),
    );

    // Handle non-2xx here so you always return a readable error payload upstream
    if (response.status < 200 || response.status >= 300) {
      const errPayload = {
        message: 'Upstream flight-status returned non-2xx',
        status: response.status,
        statusText: response.statusText,
        data: response.data,
      };
      this.logger.warn(JSON.stringify(errPayload));
      // Throw to be handled uniformly by the tool handler
      const e: any = new Error('UPSTREAM_NON_2XX');
      e.response = { status: response.status, data: response.data, headers: response.headers };
      throw e;
    }

    return response.data;
  }
}

function normalizeAxiosError(err: any) {
  const status = err?.response?.status;
  const data = err?.response?.data;
  const headers = err?.response?.headers;

  // axios network/TLS errors often have these fields
  const code = err?.code;
  const message = err?.message;

  return {
    message: 'Flight status API call failed',
    status,
    code,
    errorMessage: message,
    // Keep headers optional — can be noisy; enable when needed
    // responseHeaders: headers,
    data,
  };
}

export const ssciFlightStatusMcpTool = {
  name: 'ssci_flight_status_get',
  definition: {
    description: 'Call SSCI Flight Status API and return flightStatus payload.',
    inputSchema: SsciFlightStatusSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  handler:
    (svc: SsciFlightStatusService) =>
    async (input: SsciFlightStatusToolInput): Promise<McpToolResponse> => {
      try {
        // extra defensive check (Zod already validates, but this keeps runtime errors clean)
        if (!input?.flights?.length) {
          return toToolResponse({ message: 'Missing required argument: flights[]' }, true);
        }

        const data = await svc.getFlightStatus(input.flights, input.headers);
        return toToolResponse(data, false);
      } catch (err: any) {
        const payload = normalizeAxiosError(err);

        // Log server-side too (helps a lot in terminal)
        // eslint-disable-next-line no-console
        console.error('ssci_flight_status_get error:', payload);

        return toToolResponse(payload, true);
      }
    },
};
