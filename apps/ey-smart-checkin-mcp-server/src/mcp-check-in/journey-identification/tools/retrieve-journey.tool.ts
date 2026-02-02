import { z } from 'zod';
import {  SsciJourneyIdentificationService } from '../services/journey-identification.service';
import { JourneyIdentificationRequestPayload } from '@etihad-core/models';


/**
 * MCP tool input schema for `ssci_identification_journey`.
 * Exported so MCP can import directly.
 */
export const SsciJourneyIdentificationSchema = z.object({
  identifier: z.string().min(1).describe('Record locator / identifier'),
  lastName: z.string().min(1),

  encrypted: z.boolean().optional().default(false),
  firstName: z.string().nullable().optional().default(null),
  program: z.string().nullable().optional().default(null),
  encryptedParameters: z.null().optional().default(null),
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

export type SsciJourneyIdentificationToolInput = z.infer<typeof SsciJourneyIdentificationSchema>;

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

function normalizeHeaderOverrides(
  headers?: Record<string, unknown>,
): Partial<Record<string, string>> | undefined {
  if (!headers || typeof headers !== 'object') return undefined;

  return Object.fromEntries(
    Object.entries(headers).filter(([, v]) => typeof v === 'string' && v.length > 0),
  ) as Partial<Record<string, string>>;
}

/**
 * Ready-to-register MCP tool for SSCI Journey Identification.
 */
export const ssciIdentificationJourneyMcpTool = {
  name: 'ssci_identification_journey',
  definition: {
    description: 'Call SSCI Journey Identification API (POST journey) and return journeys/dictionary.',
    inputSchema: SsciJourneyIdentificationSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  handler:
    (service: SsciJourneyIdentificationService) =>
    async (input: SsciJourneyIdentificationToolInput): Promise<McpToolResponse> => {
      try {
        const { headers, useMock, ...payload } = input;

        const apiPayload: JourneyIdentificationRequestPayload = {
          identifier: payload.identifier,
          lastName: payload.lastName,
          encrypted: payload.encrypted ?? false,
          firstName: payload.firstName ?? null,
          program: payload.program ?? null,
          encryptedParameters: payload.encryptedParameters ?? null,
        };

        const headerOverrides = normalizeHeaderOverrides(headers as Record<string, unknown>);

        const res = await service.getJourney(apiPayload, headerOverrides, useMock);
        return toToolResponse(res);
      } catch (e: any) {
        return toToolError(e?.message ?? 'ssci_identification_journey failed');
      }
    },
} as const;
