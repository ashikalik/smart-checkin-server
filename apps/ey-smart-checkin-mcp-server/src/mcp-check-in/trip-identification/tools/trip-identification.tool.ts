import { z } from 'zod';
import type { TripIdentificationService } from '../services/trip-identification.service';

export const TripIdentificationSchema = z.object({
  frequentFlyerCardNumber: z.string().min(1),
  lastName: z.string().min(1),
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
        const { frequentFlyerCardNumber, lastName } = input;
        if (!(await service.isValidFrequentFlyerCardNumber(frequentFlyerCardNumber))) {
          return toToolError('Frequent flyer card number not found');
        }
        if (!(await service.isValidLastName(lastName))) {
          return toToolError('Last name not found');
        }
        return toToolResponse(await service.getBooking());
      } catch (e: any) {
        return toToolError(e?.message ?? 'trip_identification failed');
      }
    },
} as const;
