import { CampaignDto, EmailDto, EmailStatus, SenderDto, UserDto } from './models.js';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: unknown;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ScheduleEmailRecipient {
  email: string;
  name?: string;
  customData?: Record<string, string>;
}

export interface ScheduleEmailPayload {
  name?: string;
  subject: string;
  body: string;
  senderId?: string;
  recipients: string[] | ScheduleEmailRecipient[];
  startAt: string; // ISO 8601 string
  delayBetweenEmailsMs: number;
  hourlyLimit?: number;
  idempotencyKey?: string;
}

export interface ScheduleEmailResponseData {
  campaign: CampaignDto;
  totalAccepted: number;
  totalRejected: number;
  rejectedReasons: { email: string; reason: string }[];
  firstScheduledAt: string;
  lastScheduledAt: string;
}

export interface EmailQueryFilter {
  page?: number;
  limit?: number;
  status?: EmailStatus;
  campaignId?: string;
  search?: string;
}

export interface DashboardStatsDto {
  totalScheduled: number;
  totalSent: number;
  totalFailed: number;
  totalCampaigns: number;
  activeSenders: number;
}
