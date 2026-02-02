import { z } from 'zod';
import type { RegulatoryDetailsService, RegulatoryDetailsApiResponse } from '../services/ssci-regulatory-details.service';
import { normalizeHeaderOverrides } from '../../common/ssci-mock.util';

export const RegulatoryDetailsSchema = z.object({
  url: z.string().url().optional().describe('Optional full endpoint URL override'),
  id: z.string().min(1).optional().describe('Journey id'),
  travelerId: z.string().min(1).optional().describe('Traveler id'),
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

export type RegulatoryDetailsToolInput = z.infer<typeof RegulatoryDetailsSchema>;

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

type RegulatoryDetailsResult = {
  statusCleared: boolean | null;
  requiredFieldsMissing: string[];
  missingDetails: RegulatoryDetailsApiResponse['data'] extends infer D
    ? D extends { missingDetails?: infer M }
      ? M
      : unknown
    : unknown;
  error: string | null;
  raw?: RegulatoryDetailsApiResponse;
};

export function computeRegulatoryDetailsResult(
  payload: RegulatoryDetailsApiResponse,
): RegulatoryDetailsResult {
  try {
    const missingDetails = payload?.data?.missingDetails ?? [];
    const requiredFieldsMissing = missingDetails
      .filter((item) => item?.isOptional === false)
      .flatMap((item) =>
        (item?.detailsChoices ?? []).flatMap((choice) => choice?.requiredDetailsFields ?? []),
      )
      .filter((field): field is string => typeof field === 'string' && field.length > 0);

    return {
      statusCleared: payload?.data?.statusCleared ?? null,
      requiredFieldsMissing,
      missingDetails,
      error: null,
      raw: payload,
    };
  } catch (e: any) {
    return {
      statusCleared: null,
      requiredFieldsMissing: [],
      missingDetails: [],
      error: e?.message ?? 'compute failed',
      raw: payload,
    };
  }
}

export const ssciRegulatoryDetailsMcpTool = {
  name: 'ssci_regulatory_details',
  definition: {
    description:
      'Get regulatory details and return missing required details. Uses MOCK_SSCI switch.',
    inputSchema: RegulatoryDetailsSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  handler:
    (svc: RegulatoryDetailsService) =>
    async (input: RegulatoryDetailsToolInput): Promise<McpToolResponse> => {
      try {
        const headerOverrides = normalizeHeaderOverrides(input.headers as any);

        const apiRes = await svc.getRegulatoryDetails({
          url: input.url,
          id: input.id,
          travelerId: input.travelerId,
          headers: headerOverrides,
          useMock: input.useMock,
        });

        return toToolResponse(computeRegulatoryDetailsResult(apiRes));
      } catch (e: any) {
        return toToolError(e?.message ?? 'ssci_regulatory_details failed');
      }
    },
} as const;
