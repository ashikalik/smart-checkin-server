// apps/ey-smart-checkin-mcp-server/src/mcp-check-in/process-check-in/tools/validate-process-checkin.tools.ts
import { z } from 'zod';
import type { ValidateProcessCheckinService, ValidateProcessCheckinApiResponse } from '../services/ssci-process-checkin.service';
import { normalizeHeaderOverrides } from '../../common/ssci-mock.util';

export const ValidateProcessCheckinSchema = z.object({
  // optional for real calls
  url: z.string().url().optional().describe('Optional full endpoint URL override'),
  resourceId: z.string().min(1).optional().describe('Optional path id appended to base URL'),
  areSecurityQuestionsAnswered: z.boolean().optional(),
  rawBody: z.string().optional().describe('Optional raw JSON string forwarded to upstream POST'),
  useMock: z.boolean().optional(),
  headers: z
    .object({
      'x-correlation-id': z.string().optional(),
      'x-transaction-id': z.string().optional(),
      'x-client-application': z.string().optional(),
      'x-client-channel': z.string().optional(),
    })
    .optional()
    .describe('Optional header overrides. Values here override defaults.'),
});

export type ValidateProcessCheckinToolInput = z.infer<typeof ValidateProcessCheckinSchema>;

type McpToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

const toToolResponse = (data: unknown): McpToolResponse => ({
  content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
});

const toToolError = (message: string): McpToolResponse => ({
  isError: true,
  content: [{ type: 'text', text: message }],
});

type PassengerToCheckIn = {
  journeyElementId: string;
  travelerId: string;
  title: string | null;
  firstName: string | null;
  lastName: string | null;
  passengerTypeCode: string | null;
  flightId: string | null;
  orderId: string | null;
};

type ValidateProcessCheckinResult = {
  passengersToCheckIn: PassengerToCheckIn[];
  prompt: string | null;
  error: string | null;
  raw?: ValidateProcessCheckinApiResponse; // useful for debugging
};

function s(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}

function fullName(p: PassengerToCheckIn): string {
  return [p.title, p.firstName, p.lastName].filter(Boolean).join(' ');
}

export function computePassengersToCheckIn(payload: ValidateProcessCheckinApiResponse): ValidateProcessCheckinResult {
  try {
    const notChecked = payload?.data?.notCheckedInJourneyElements ?? [];
    const journeyElementDict = payload?.dictionaries?.journeyElement ?? {};
    const travelerDict = payload?.dictionaries?.traveler ?? {};

    const passengers: PassengerToCheckIn[] = [];

    for (const x of notChecked) {
      const journeyElementId = s(x?.id);
      if (!journeyElementId) continue;

      const je = journeyElementDict[journeyElementId];
      if (!je) continue;

      const travelerId = s(je?.travelerId);
      if (!travelerId) continue;

      const traveler = travelerDict[travelerId];
      const name0 = Array.isArray(traveler?.names) ? traveler!.names![0] : undefined;

      passengers.push({
        journeyElementId,
        travelerId,
        title: s(name0?.title),
        firstName: s(name0?.firstName),
        lastName: s(name0?.lastName),
        passengerTypeCode: s(traveler?.passengerTypeCode),
        flightId: s(je?.flightId),
        orderId: s(je?.orderId),
      });
    }

    let prompt: string | null = null;
    if (passengers.length === 1) {
      prompt = `Do you want to check in this passenger: ${fullName(passengers[0])}?`;
    } else if (passengers.length > 1) {
      prompt = `Do you want to check in these passengers: ${passengers.map(fullName).join(', ')}?`;
    }

    return { passengersToCheckIn: passengers, prompt, error: null, raw: payload };
  } catch (e: any) {
    return { passengersToCheckIn: [], prompt: null, error: e?.message ?? 'compute failed', raw: payload };
  }
}

export const ssciValidateProcessCheckinMcpTool = {
  name: 'ssci_validate_process_checkin',
  definition: {
    description:
      'Validate process check-in and return passengers who still need check-in + a prompt. Uses MOCK_SSCI switch.',
    inputSchema: ValidateProcessCheckinSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  handler:
    (svc: ValidateProcessCheckinService) =>
    async (input: ValidateProcessCheckinToolInput): Promise<McpToolResponse> => {
      try {
        const headerOverrides = normalizeHeaderOverrides(input.headers as any);

        let body: unknown = undefined;
        if (input.rawBody) {
          try {
            body = JSON.parse(input.rawBody);
          } catch {
            return toToolError('rawBody must be valid JSON string');
          }
        }

        const apiRes = await svc.validateProcessCheckIn({
          url: input.url,
          resourceId: input.resourceId,
          areSecurityQuestionsAnswered: input.areSecurityQuestionsAnswered,
          rawBody: body,
          headers: headerOverrides,
          useMock: input.useMock,
        });

        return toToolResponse(computePassengersToCheckIn(apiRes));
      } catch (e: any) {
        return toToolError(e?.message ?? 'ssci_validate_process_checkin failed');
      }
    },
} as const;
