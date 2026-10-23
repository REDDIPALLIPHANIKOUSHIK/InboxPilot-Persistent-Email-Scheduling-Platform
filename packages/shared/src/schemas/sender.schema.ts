import { z } from 'zod';
import { isValidEmail } from '../utils/csvParser.js';

export const createSenderSchema = z.object({
  name: z.string().min(1, 'Sender name is required').max(100),
  email: z.string().refine(isValidEmail, { message: 'Valid sender email is required' }),
  isDefault: z.boolean().optional().default(false),
  hourlyLimit: z.number().int().positive().optional().default(200),
  minimumSendIntervalMs: z.number().int().min(0).optional().default(2000),
});

export type CreateSenderInput = z.infer<typeof createSenderSchema>;

export const updateSenderSchema = createSenderSchema.partial();
export type UpdateSenderInput = z.infer<typeof updateSenderSchema>;
