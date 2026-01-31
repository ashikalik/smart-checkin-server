import { z } from 'zod';
import type { BoardingPassService, BoardingPassApiResponse } from '../services/ssci-boarding-pass.service';
import { normalizeHeaderOverrides } from '../../common/ssci-mock.util';

export const BoardingPassSchema = z.object({
  url: z.string().url().optional().describe('Optional full endpoint URL override'),
  resourceId: z.string().min(1).optional().describe('Optional path id appended to base URL'),
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

export type BoardingPassToolInput = z.infer<typeof BoardingPassSchema>;

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

type BoardingPassToolResult = {
  isBoardingPassEligible: boolean | null;
  eligibilityStatus: string | null;
  boardingPasses: BoardingPassApiResponse['boardingPasses'] | null;
  error: string | null;
  raw?: BoardingPassApiResponse;
};

function s(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}

export function computeBoardingPassResult(payload: BoardingPassApiResponse): BoardingPassToolResult {
  try {
    const passes = payload?.boardingPasses ?? [];
    const allLegs = passes.flatMap((p) => p.legs ?? []);
    const eligibilityStatus = s(allLegs.find((leg) => s(leg?.eligibility))?.eligibility);
    const isBoardingPassEligible = allLegs.some(
      (leg) => s(leg?.eligibility) === 'BOARDING_PASS_ELIGIBLE',
    );

    return {
      isBoardingPassEligible,
      eligibilityStatus,
      boardingPasses: passes,
      error: null,
      raw: payload,
    };
  } catch (e: any) {
    return {
      isBoardingPassEligible: null,
      eligibilityStatus: null,
      boardingPasses: null,
      error: e?.message ?? 'compute failed',
      raw: payload,
    };
  }
}

export const ssciBoardingPassMcpTool = {
  name: 'ssci_boarding_pass',
  definition: {
    description: 'Fetch boarding pass and return eligibility status. Uses MOCK_SSCI switch.',
    inputSchema: BoardingPassSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  handler:
    (svc: BoardingPassService) =>
    async (input: BoardingPassToolInput): Promise<McpToolResponse> => {
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

        const apiRes = await svc.getBoardingPass({
          url: input.url,
          resourceId: input.resourceId,
          rawBody: body,
          headers: headerOverrides,
        });

        return toToolResponse(computeBoardingPassResult(apiRes));
      } catch (e: any) {
        return toToolError(e?.message ?? 'ssci_boarding_pass failed');
      }
    },
} as const;
