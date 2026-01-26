import { z } from 'zod';

// NOTE: registerTool expects a "raw shape" (object of zod fields), not z.object(...)
export const IdentificationSchema = {
  pnr: z.string().min(1),
  lastName: z.string().min(1),
};

export type IdentificationInput = {
  pnr: string;
  lastName: string;
};
