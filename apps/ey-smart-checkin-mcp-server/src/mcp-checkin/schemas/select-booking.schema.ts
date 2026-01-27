import { z } from 'zod';

// NOTE: registerTool expects a "raw shape" (object of zod fields), not z.object(...)
export const SelectBookingSchema = {
  utterance: z.string().min(1),
  choices: z.array(
    z.object({
      id: z.string().min(1),
      summary: z.string().optional(),
    }),
  ),
};

export type SelectBookingInput = {
  utterance: string;
  choices: Array<{
    id: string;
    summary?: string;
  }>;
};
