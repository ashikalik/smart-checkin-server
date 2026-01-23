import { z } from 'zod';

// NOTE: registerTool expects a "raw shape" (object of zod fields), not z.object(...)
export const TwoNumberSchema = {
  a: z.number(),
  b: z.number(),
};

export const PercentSchema = {
  percent: z.number(),
  value: z.number(),
};

export type TwoNumberInput = {
  a: number;
  b: number;
};

export type PercentInput = {
  percent: number;
  value: number;
};
