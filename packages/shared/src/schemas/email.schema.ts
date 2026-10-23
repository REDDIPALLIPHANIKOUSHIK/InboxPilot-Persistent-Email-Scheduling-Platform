import { z } from 'zod';
import { isValidEmail } from '../utils/csvParser.js';

export const scheduleEmailSchema = z.object({
  name: z.string().min(1).max(255).optional().default('Untitled Campaign'),
  subject: z.string().min(1, 'Subject is required').max(500),
  body: z.string().min(1, 'Body is required'),
  senderId: z.string().uuid().optional(),
  recipients: z.array(z.string()).min(1, 'At least one recipient is required').refine(
    (arr) => arr.every((email) => isValidEmail(email)),
    { message: 'All recipients must be valid email addresses' }
  ),
  startAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)),
  delayBetweenEmailsMs: z.number().int().min(0, 'Delay must be non-negative').default(1000),
  hourlyLimit: z.number().int().positive('Hourly limit must be positive').optional().default(200),
  idempotencyKey: z.string().max(100).optional(),
});

export type ScheduleEmailInput = z.input<typeof scheduleEmailSchema>;
export type ScheduleEmailOutput = z.output<typeof scheduleEmailSchema>;

export const emailQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  status: z.enum(['scheduled', 'processing', 'sent', 'failed', 'cancelled']).optional(),
  campaignId: z.string().uuid().optional(),
  search: z.string().optional(),
});

export type EmailQueryInput = z.infer<typeof emailQuerySchema>;
