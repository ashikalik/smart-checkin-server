import { z } from 'zod';

// NOTE: registerTool expects a "raw shape" (object of zod fields), not z.object(...)
export const FfpBookingSchema = {
  frequentFlyerCardNumber: z.string().min(1),
  lastName: z.string().min(1),
};

export type FfpBookingInput = {
  frequentFlyerCardNumber: string;
  lastName: string;
};
