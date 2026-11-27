import { z } from 'zod';

export const healthSchema = z.object({
  status: z.enum(['ok', 'unavailable']),
  database: z.enum(['connected', 'unavailable']),
});

export type Health = z.infer<typeof healthSchema>;
