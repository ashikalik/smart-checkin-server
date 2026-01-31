// apps/ey-smart-checkin-mcp-server/src/mcp-check-in/check-in-acceptance/tools/checkin-acceptance.tools.ts
import { z } from 'zod';
import type { CheckinAcceptanceService, CheckinAcceptanceApiResponse } from '../services/ssci-checkin-acceptance.service';
import { normalizeHeaderOverrides } from '../../common/ssci-mock.util';

export const CheckinAcceptanceSchema = z.object({
  // optional for real calls
  url: z.string().url().optional().describe('Optional full endpoint URL override'),
  resourceId: z.string().min(1).optional().describe('Optional path id appended to base URL'),
  areSecurityQuestionsAnswered: z.boolean().optional(),
  rawBody: z
    .string()
    .optional()
    .describe('Optional raw JSON string forwarded to upstream POST. If omitted, a GET is used.'),
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

export type CheckinAcceptanceToolInput = z.infer<typeof CheckinAcceptanceSchema>;

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

type CheckedInPassenger = {
  journeyElementId: string;
  travelerId: string;
  title: string | null;
  firstName: string | null;
  lastName: string | null;
  passengerTypeCode: string | null;
  flightId: string | null;
  orderId: string | null;
  checkInStatus: string | null;
};

type CheckinAcceptanceResult = {
  isAccepted: boolean | null;
  isPartial: boolean | null;
  isEligibleForVoluntaryDeniedBoarding: boolean | null;
  isVoluntaryDeniedBoarding: boolean | null;
  checkinStatusMessage: string | null;
  checkedInPassengers: CheckedInPassenger[];
  error: string | null;
  raw?: CheckinAcceptanceApiResponse; // useful for debugging
};

function s(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}

export function computeCheckinAcceptanceResult(payload: CheckinAcceptanceApiResponse): CheckinAcceptanceResult {
  try {
    const checkedIn = payload?.data?.checkedInJourneyElements ?? [];
    const journeyElementDict = payload?.dictionaries?.journeyElement ?? {};
    const travelerDict = payload?.dictionaries?.traveler ?? {};

    const passengers: CheckedInPassenger[] = [];

    for (const x of checkedIn) {
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
        checkInStatus: s(je?.checkInStatus),
      });
    }

    const isAccepted = payload?.data?.isAccepted ?? null;
    const isPartial = payload?.data?.isPartial ?? null;

    let checkinStatusMessage: string | null = null;
    if (isAccepted === true) {
      checkinStatusMessage = 'Check-in completed successfully.';
    } else if (isPartial === true) {
      checkinStatusMessage = 'Check-in partially completed.';
    }

    return {
      isAccepted,
      isPartial,
      isEligibleForVoluntaryDeniedBoarding:
        payload?.data?.isEligibleForVoluntaryDeniedBoarding ?? null,
      isVoluntaryDeniedBoarding: payload?.data?.isVoluntaryDeniedBoarding ?? null,
      checkinStatusMessage,
      checkedInPassengers: passengers,
      error: null,
      raw: payload,
    };
  } catch (e: any) {
    return {
      isAccepted: null,
      isPartial: null,
      isEligibleForVoluntaryDeniedBoarding: null,
      isVoluntaryDeniedBoarding: null,
      checkinStatusMessage: null,
      checkedInPassengers: [],
      error: e?.message ?? 'compute failed',
      raw: payload,
    };
  }
}

export const ssciCheckinAcceptanceMcpTool = {
  name: 'ssci_checkin_acceptance',
  definition: {
    description:
      'Check-in acceptance and return checked-in passengers + acceptance flags. Uses MOCK_SSCI switch.',
    inputSchema: CheckinAcceptanceSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  handler:
    (svc: CheckinAcceptanceService) =>
    async (input: CheckinAcceptanceToolInput): Promise<McpToolResponse> => {
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

        const apiRes = await svc.checkInAcceptance({
          url: input.url,
          resourceId: input.resourceId,
          areSecurityQuestionsAnswered: input.areSecurityQuestionsAnswered,
          rawBody: body,
          headers: headerOverrides,
        });

        return toToolResponse(computeCheckinAcceptanceResult(apiRes));
      } catch (e: any) {
        return toToolError(e?.message ?? 'ssci_checkin_acceptance failed');
      }
    },
} as const;
