import { z } from 'zod';
import type { TripIdentificationService } from '../services/trip-identification.service';

export const TripIdentificationSchema = z.object({
  frequentFlyerCardNumber: z.string().min(1),
  lastName: z.string().min(1),
  useMock: z.boolean().optional(),
});

export type TripIdentificationToolInput = z.infer<typeof TripIdentificationSchema>;

type McpToolResponse = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

const toToolResponse = (data: unknown): McpToolResponse => ({
  content: [{ type: 'text', text: JSON.stringify(data) }],
});

const toToolError = (message: string): McpToolResponse => ({
  isError: true,
  content: [{ type: 'text', text: message }],
});

export const tripIdentificationMcpTool = {
  name: 'trip_identification',
  definition: {
    description: 'Return FFP booking data for trip identification.',
    inputSchema: TripIdentificationSchema,
    annotations: { readOnlyHint: true, idempotentHint: true },
  },
  handler:
    (service: TripIdentificationService) =>
    async (input: TripIdentificationToolInput): Promise<McpToolResponse> => {
      try {
        const { frequentFlyerCardNumber, lastName, useMock } = input;
        if (!(await service.isValidFrequentFlyerCardNumber(frequentFlyerCardNumber, useMock))) {
          return toToolError('Frequent flyer card number not found');
        }
        if (!(await service.isValidLastName(lastName, useMock))) {
          return toToolError('Last name not found');
        }
        const booking = await service.getBooking(useMock);
        const data = (booking?.data ?? []).map((item) => ({
          id: item?.id ?? null,
          lastName: item?.travelers?.[0]?.names?.[0]?.lastName ?? null,
        }));
        return toToolResponse({ data });
      } catch (e: any) {
        return toToolError(e?.message ?? 'trip_identification failed');
      }
    },
} as const;
