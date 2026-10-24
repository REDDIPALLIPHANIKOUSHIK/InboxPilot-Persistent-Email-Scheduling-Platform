export type EmailStatus = 'scheduled' | 'processing' | 'sent' | 'failed' | 'cancelled';
export type CampaignStatus = 'active' | 'completed' | 'paused' | 'cancelled';
export type DeliveryAttemptStatus = 'success' | 'failed';

export interface UserDto {
  id: string;
  googleId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SenderDto {
  id: string;
  userId: string;
  name: string;
  email: string;
  isDefault: boolean;
  hourlyLimit: number;
  minimumSendIntervalMs: number;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignDto {
  id: string;
  userId: string;
  senderId: string;
  name: string;
  subject: string;
  body: string;
  startAt: string;
  delayBetweenEmailsMs: number;
  hourlyLimit: number;
  status: CampaignStatus;
  idempotencyKey?: string | null;
  totalEmails: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
  sender?: SenderDto;
}

export interface DeliveryAttemptDto {
  id: string;
  emailId: string;
  attemptNumber: number;
  startedAt: string;
  completedAt: string | null;
  status: DeliveryAttemptStatus;
  errorMessage: string | null;
  providerMessageId: string | null;
  createdAt: string;
}

export interface EmailDto {
  id: string;
  userId: string;
  campaignId: string;
  senderId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  scheduledAt: string;
  sentAt: string | null;
  status: EmailStatus;
  idempotencyKey: string;
  bullmqJobId: string | null;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  sender?: SenderDto;
  campaign?: CampaignDto;
  deliveryAttempts?: DeliveryAttemptDto[];
  etherealPreviewUrl?: string | null;
}
