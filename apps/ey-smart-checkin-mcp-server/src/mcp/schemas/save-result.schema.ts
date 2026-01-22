import { z } from 'zod';

export const SaveResultSchema = {
  operation: z.string(),
  result: z.number(),
};

export type SaveResultInput = {
  operation: string;
  result: number;
};
