import { z } from 'zod';
import type { AncillaryCatalogueService, AncillaryCatalogueApiResponse } from '../services/ssci-ancillary-catalogue.service';
import { normalizeHeaderOverrides } from '../../common/ssci-mock.util';

export const AncillaryCatalogueSchema = z.object({
  url: z.string().url().optional().describe('Optional full endpoint URL override'),
  journeyId: z.string().min(1).optional().describe('Journey id'),
  journeyElementId: z.string().min(1).optional().describe('Journey element id'),
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

export type AncillaryCatalogueToolInput = z.infer<typeof AncillaryCatalogueSchema>;

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

type AncillaryCatalogueResult = {
  hasAncillaryForPurchase: boolean;
  availableServices: Array<{ key: string; label: string }>;
  serviceDetails?: Record<string, unknown>;
  error: string | null;
  raw?: AncillaryCatalogueApiResponse;
};

function mapServiceLabel(key: string): string {
  switch (key) {
    case 'businessClassLoungeAccessDetails':
      return 'Business class lounge available for purchase';
    case 'firstClassLoungeAccessDetails':
      return 'First class lounge available for purchase';
    case 'priorityAccessDetails':
      return 'Priority access available for purchase';
    default:
      return key;
  }
}

function extractAvailableServices(payload: AncillaryCatalogueApiResponse) {
  const serviceDetails = (payload as { serviceDetails?: Record<string, unknown> }).serviceDetails ?? {};
  const entries = Object.entries(serviceDetails);
  const available = entries
    .filter(([, value]) => typeof value === 'object' && value && (value as any).showService === true)
    .map(([key]) => ({ key, label: mapServiceLabel(key) }));
  const filteredDetails = Object.fromEntries(
    available.map(({ key }) => [key, serviceDetails[key]]),
  );
  return { serviceDetails: filteredDetails, available };
}

export function computeAncillaryCatalogueResult(payload: AncillaryCatalogueApiResponse): AncillaryCatalogueResult {
  try {
    const { serviceDetails, available } = extractAvailableServices(payload);
    return {
      hasAncillaryForPurchase: available.length > 0,
      availableServices: available,
      serviceDetails,
      error: null,
    };
  } catch (e: any) {
    return {
      hasAncillaryForPurchase: false,
      availableServices: [],
      error: e?.message ?? 'compute failed',
      raw: payload,
    };
  }
}

export const ssciAncillaryCatalogueMcpTool = {
  name: 'ssci_ancillary_catalogue',
  definition: {
    description:
      'Get ancillary catalogue and return purchasable services. Uses MOCK_SSCI switch.',
    inputSchema: AncillaryCatalogueSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  handler:
    (svc: AncillaryCatalogueService) =>
    async (input: AncillaryCatalogueToolInput): Promise<McpToolResponse> => {
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

        const apiRes = await svc.getAncillaryCatalogue({
          url: input.url,
          journeyId: input.journeyId,
          journeyElementId: input.journeyElementId,
          rawBody: body,
          headers: headerOverrides,
          useMock: input.useMock,
        });

        return toToolResponse(computeAncillaryCatalogueResult(apiRes));
      } catch (e: any) {
        return toToolError(e?.message ?? 'ssci_ancillary_catalogue failed');
      }
    },
} as const;
