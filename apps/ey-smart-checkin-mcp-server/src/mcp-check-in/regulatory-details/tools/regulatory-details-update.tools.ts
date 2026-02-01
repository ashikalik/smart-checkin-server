import { z } from 'zod';
import type { RegulatoryDetailsService } from '../services/ssci-regulatory-details.service';
import { normalizeHeaderOverrides } from '../../common/ssci-mock.util';

export const RegulatoryDetailsUpdateSchema = z.object({
  url: z.string().url().optional().describe('Optional full endpoint URL override'),
  id: z.string().min(1).optional().describe('Journey id'),
  travelerId: z.string().min(1).optional().describe('Traveler id'),
  rawBody: z
    .string()
    .optional()
    .describe('Required JSON body string for POST update'),
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

export type RegulatoryDetailsUpdateToolInput = z.infer<typeof RegulatoryDetailsUpdateSchema>;

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

export const ssciRegulatoryDetailsUpdateMcpTool = {
  name: 'ssci_regulatory_details_update',
  definition: {
    description: 'Update regulatory details via POST. Uses MOCK_SSCI switch.',
    inputSchema: RegulatoryDetailsUpdateSchema,
    annotations: { readOnlyHint: false, idempotentHint: false },
  },
  handler:
    (svc: RegulatoryDetailsService) =>
    async (input: RegulatoryDetailsUpdateToolInput): Promise<McpToolResponse> => {
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

        const apiRes = await svc.updateRegulatoryDetails({
          url: input.url,
          id: input.id,
          travelerId: input.travelerId,
          rawBody: body,
          headers: headerOverrides,
        });

        return toToolResponse(apiRes);
      } catch (e: any) {
        return toToolError(e?.message ?? 'ssci_regulatory_details_update failed');
      }
    },
} as const;
