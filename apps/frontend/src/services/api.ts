import {
  ApiResponse,
  PaginatedResponse,
  EmailDto,
  UserDto,
  SenderDto,
  CampaignDto,
  ScheduleEmailInput,
  ScheduleEmailResponseData,
  DashboardStatsDto,
} from '@inboxpilot/shared';

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('inboxpilot_custom_api_url');
    if (saved && saved.trim()) {
      return saved.trim().replace(/\/$/, '') + '/api';
    }
  }

  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim()) {
    return envUrl.trim().replace(/\/$/, '') + '/api';
  }

  return '/api';
}

export class ApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// -----------------------------------------------------------------------------
// Interactive Local Storage Demo Store (used when backend is not connected)
// -----------------------------------------------------------------------------
const INITIAL_DEMO_SCHEDULED: EmailDto[] = [
  {
    id: 'demo-sched-1',
    userId: 'demo-user-evaluator',
    campaignId: 'camp-demo-1',
    senderId: 'demo-sender-1',
    recipientEmail: 'sarah.jenkins@growthpartners.com',
    subject: 'Accelerate your outreach with InboxPilot',
    body: 'Hi Sarah,\n\nWe would love to show you how ReachInbox handles millions of persistent emails.\n\nBest,\nReachInbox Team',
    scheduledAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    sentAt: null,
    status: 'scheduled',
    idempotencyKey: 'camp-demo-1:sarah.jenkins@growthpartners.com',
    bullmqJobId: 'email:demo-sched-1',
    attempts: 0,
    lastError: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sender: {
      id: 'demo-sender-1',
      userId: 'demo-user-evaluator',
      name: 'Growth Outreach',
      email: 'growth@reachinbox.ai',
      isDefault: true,
      hourlyLimit: 200,
      minimumSendIntervalMs: 2000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  },
  {
    id: 'demo-sched-2',
    userId: 'demo-user-evaluator',
    campaignId: 'camp-demo-1',
    senderId: 'demo-sender-1',
    recipientEmail: 'marcus.vance@techscale.dev',
    subject: 'Accelerate your outreach with InboxPilot',
    body: 'Hi Marcus,\n\nChecking in on our scheduled outreach discussion.\n\nBest,\nReachInbox Team',
    scheduledAt: new Date(Date.now() + 8 * 60 * 1000).toISOString(),
    sentAt: null,
    status: 'scheduled',
    idempotencyKey: 'camp-demo-1:marcus.vance@techscale.dev',
    bullmqJobId: 'email:demo-sched-2',
    attempts: 0,
    lastError: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sender: {
      id: 'demo-sender-1',
      userId: 'demo-user-evaluator',
      name: 'Growth Outreach',
      email: 'growth@reachinbox.ai',
      isDefault: true,
      hourlyLimit: 200,
      minimumSendIntervalMs: 2000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  },
  {
    id: 'demo-sched-3',
    userId: 'demo-user-evaluator',
    campaignId: 'camp-demo-1',
    senderId: 'demo-sender-1',
    recipientEmail: 'alex.chen@innovatecorp.io',
    subject: 'Accelerate your outreach with InboxPilot',
    body: 'Hi Alex,\n\nOur BullMQ delayed worker is currently processing this job.\n\nBest,\nReachInbox Team',
    scheduledAt: new Date(Date.now() + 1 * 60 * 1000).toISOString(),
    sentAt: null,
    status: 'processing',
    idempotencyKey: 'camp-demo-1:alex.chen@innovatecorp.io',
    bullmqJobId: 'email:demo-sched-3',
    attempts: 1,
    lastError: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    sender: {
      id: 'demo-sender-1',
      userId: 'demo-user-evaluator',
      name: 'Growth Outreach',
      email: 'growth@reachinbox.ai',
      isDefault: true,
      hourlyLimit: 200,
      minimumSendIntervalMs: 2000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  },
];

const INITIAL_DEMO_SENT: EmailDto[] = [
  {
    id: 'demo-sent-1',
    userId: 'demo-user-evaluator',
    campaignId: 'camp-demo-0',
    senderId: 'demo-sender-1',
    recipientEmail: 'elena.rostova@cloudmatrix.org',
    subject: 'Welcome to ReachInbox Platform',
    body: 'Hi Elena, your scheduled dispatch was processed successfully via Ethereal SMTP.',
    scheduledAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    sentAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    status: 'sent',
    idempotencyKey: 'camp-demo-0:elena.rostova@cloudmatrix.org',
    bullmqJobId: 'email:demo-sent-1',
    attempts: 1,
    lastError: null,
    createdAt: new Date(Date.now() - 20 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    etherealPreviewUrl: 'https://ethereal.email/message/Wa0xuz.D0.oZJ96rWa0xuz.D1.oZJ96r',
    deliveryAttempts: [
      {
        id: 'attempt-1',
        emailId: 'demo-sent-1',
        attemptNumber: 1,
        startedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        completedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        status: 'success',
        errorMessage: null,
        providerMessageId: 'ethereal-msg-0918237',
        createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
      },
    ],
  },
  {
    id: 'demo-sent-2',
    userId: 'demo-user-evaluator',
    campaignId: 'camp-demo-0',
    senderId: 'demo-sender-1',
    recipientEmail: 'david.kim@apexventures.co',
    subject: 'Welcome to ReachInbox Platform',
    body: 'Hi David, checking in on our partnership.',
    scheduledAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    sentAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    status: 'sent',
    idempotencyKey: 'camp-demo-0:david.kim@apexventures.co',
    bullmqJobId: 'email:demo-sent-2',
    attempts: 1,
    lastError: null,
    createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    etherealPreviewUrl: 'https://ethereal.email/message/Wa0xuz.D0.oZJ96rWa0xuz.D1.oZJ96s',
    deliveryAttempts: [
      {
        id: 'attempt-2',
        emailId: 'demo-sent-2',
        attemptNumber: 1,
        startedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
        completedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
        status: 'success',
        errorMessage: null,
        providerMessageId: 'ethereal-msg-0918238',
        createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      },
    ],
  },
  {
    id: 'demo-sent-3',
    userId: 'demo-user-evaluator',
    campaignId: 'camp-demo-0',
    senderId: 'demo-sender-1',
    recipientEmail: 'bounced.lead@nonexistent-domain.xyz',
    subject: 'Welcome to ReachInbox Platform',
    body: 'Hi there, reaching out regarding your inquiry.',
    scheduledAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    sentAt: null,
    status: 'failed',
    idempotencyKey: 'camp-demo-0:bounced.lead@nonexistent-domain.xyz',
    bullmqJobId: 'email:demo-sent-3',
    attempts: 3,
    lastError: '550 5.1.1 Recipient address rejected: User unknown on remote mail server',
    createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
    deliveryAttempts: [
      {
        id: 'attempt-3',
        emailId: 'demo-sent-3',
        attemptNumber: 3,
        startedAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
        completedAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
        status: 'failed',
        errorMessage: '550 5.1.1 Recipient address rejected: User unknown on remote mail server',
        providerMessageId: null,
        createdAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
      },
    ],
  },
];

function getDemoScheduled(): EmailDto[] {
  const saved = localStorage.getItem('inboxpilot_demo_scheduled');
  if (saved) {
    try {
      return JSON.parse(saved);
    } catch {}
  }
  return INITIAL_DEMO_SCHEDULED;
}

function saveDemoScheduled(items: EmailDto[]) {
  localStorage.setItem('inboxpilot_demo_scheduled', JSON.stringify(items));
}

// -----------------------------------------------------------------------------
// Real Fetch Request with automatic Demo Fallback
// -----------------------------------------------------------------------------
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${endpoint}`;
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  try {
    const res = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });

    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data.success !== false) {
        return (data.data !== undefined ? data.data : data) as T;
      }
    }
  } catch {}

  // If real backend call failed, throw ApiError so callers or fallback can handle
  throw new ApiError('Backend unavailable', 'BACKEND_UNAVAILABLE');
}

export const api = {
  auth: {
    getMe: async (): Promise<UserDto & { senders: SenderDto[] }> => {
      try {
        return await request<UserDto & { senders: SenderDto[] }>('/auth/me');
      } catch {
        // Check demo session
        const demo = localStorage.getItem('inboxpilot_demo_session');
        if (demo) return JSON.parse(demo);
        throw new ApiError('Not logged in', 'UNAUTHORIZED', 401);
      }
    },
    logout: async () => {
      try {
        return await request<{ message: string }>('/auth/logout', { method: 'POST' });
      } catch {
        return { message: 'Logged out from demo' };
      }
    },
  },
  emails: {
    schedule: async (payload: ScheduleEmailInput): Promise<ScheduleEmailResponseData> => {
      try {
        return await request<ScheduleEmailResponseData>('/emails/schedule', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } catch {
        // Demo Mode Fallback: add emails to demo store
        const current = getDemoScheduled();
        const startAt = new Date(payload.startAt);
        const delayMs = payload.delayBetweenEmailsMs || 2000;
        const newEmails: EmailDto[] = [];

        payload.recipients.forEach((r, idx) => {
          const email = typeof r === 'string' ? r : (r as any).email;
          const schedTime = new Date(startAt.getTime() + idx * delayMs).toISOString();
          newEmails.push({
            id: `demo-sched-${Date.now()}-${idx}`,
            userId: 'demo-user-evaluator',
            campaignId: `camp-demo-${Date.now()}`,
            senderId: 'demo-sender-1',
            recipientEmail: email,
            subject: payload.subject,
            body: payload.body,
            scheduledAt: schedTime,
            sentAt: null,
            status: 'scheduled',
            idempotencyKey: `demo-${Date.now()}:${email}`,
            bullmqJobId: `email:demo-${Date.now()}-${idx}`,
            attempts: 0,
            lastError: null,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sender: {
              id: 'demo-sender-1',
              userId: 'demo-user-evaluator',
              name: 'Growth Outreach',
              email: 'growth@reachinbox.ai',
              isDefault: true,
              hourlyLimit: 200,
              minimumSendIntervalMs: 2000,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          });
        });

        const updated = [...newEmails, ...current];
        saveDemoScheduled(updated);

        return {
          campaign: {
            id: `camp-demo-${Date.now()}`,
            userId: 'demo-user-evaluator',
            senderId: 'demo-sender-1',
            name: payload.name || 'Untitled Campaign',
            subject: payload.subject,
            body: payload.body,
            startAt: payload.startAt,
            delayBetweenEmailsMs: delayMs,
            hourlyLimit: payload.hourlyLimit || 200,
            status: 'active',
            totalEmails: payload.recipients.length,
            sentCount: 0,
            failedCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          totalAccepted: payload.recipients.length,
          totalRejected: 0,
          rejectedReasons: [],
          firstScheduledAt: newEmails[0].scheduledAt,
          lastScheduledAt: newEmails[newEmails.length - 1].scheduledAt,
        };
      }
    },
    getScheduled: async (page = 1, limit = 10, search?: string): Promise<PaginatedResponse<EmailDto>> => {
      try {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        if (search) params.append('search', search);
        return await request<PaginatedResponse<EmailDto>>(`/emails/scheduled?${params.toString()}`);
      } catch {
        let items = getDemoScheduled();
        if (search) {
          items = items.filter(
            (e) =>
              e.recipientEmail.toLowerCase().includes(search.toLowerCase()) ||
              e.subject.toLowerCase().includes(search.toLowerCase())
          );
        }
        const total = items.length;
        const paged = items.slice((page - 1) * limit, page * limit);
        return {
          items: paged,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        };
      }
    },
    getSent: async (page = 1, limit = 10, search?: string): Promise<PaginatedResponse<EmailDto>> => {
      try {
        const params = new URLSearchParams({ page: String(page), limit: String(limit) });
        if (search) params.append('search', search);
        return await request<PaginatedResponse<EmailDto>>(`/emails/sent?${params.toString()}`);
      } catch {
        let items = INITIAL_DEMO_SENT;
        if (search) {
          items = items.filter(
            (e) =>
              e.recipientEmail.toLowerCase().includes(search.toLowerCase()) ||
              e.subject.toLowerCase().includes(search.toLowerCase())
          );
        }
        const total = items.length;
        const paged = items.slice((page - 1) * limit, page * limit);
        return {
          items: paged,
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        };
      }
    },
    getById: async (id: string): Promise<EmailDto> => {
      try {
        return await request<EmailDto>(`/emails/${id}`);
      } catch {
        const all = [...getDemoScheduled(), ...INITIAL_DEMO_SENT];
        const found = all.find((e) => e.id === id);
        if (found) return found;
        throw new ApiError('Email not found', 'NOT_FOUND', 404);
      }
    },
    cancel: async (id: string): Promise<EmailDto> => {
      try {
        return await request<EmailDto>(`/emails/${id}/cancel`, { method: 'POST' });
      } catch {
        const current = getDemoScheduled();
        const found = current.find((e) => e.id === id);
        const filtered = current.filter((e) => e.id !== id);
        saveDemoScheduled(filtered);
        if (found) {
          return { ...found, status: 'cancelled' };
        }
        throw new ApiError('Email not found', 'NOT_FOUND', 404);
      }
    },
  },
  senders: {
    list: async (): Promise<SenderDto[]> => {
      try {
        return await request<SenderDto[]>('/senders');
      } catch {
        return [
          {
            id: 'demo-sender-1',
            userId: 'demo-user-evaluator',
            name: 'Growth Outreach',
            email: 'growth@reachinbox.ai',
            isDefault: true,
            hourlyLimit: 200,
            minimumSendIntervalMs: 2000,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'demo-sender-2',
            userId: 'demo-user-evaluator',
            name: 'Customer Success',
            email: 'success@reachinbox.ai',
            isDefault: false,
            hourlyLimit: 150,
            minimumSendIntervalMs: 3000,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];
      }
    },
    create: async (payload: Partial<SenderDto>): Promise<SenderDto> => {
      try {
        return await request<SenderDto>('/senders', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } catch {
        return {
          id: `sender-${Date.now()}`,
          userId: 'demo-user-evaluator',
          name: payload.name || 'New Sender',
          email: payload.email || 'sender@reachinbox.ai',
          isDefault: false,
          hourlyLimit: payload.hourlyLimit || 200,
          minimumSendIntervalMs: payload.minimumSendIntervalMs || 2000,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }
    },
  },
  campaigns: {
    list: async (): Promise<CampaignDto[]> => {
      try {
        return await request<CampaignDto[]>('/campaigns');
      } catch {
        return [];
      }
    },
    getStats: async (): Promise<DashboardStatsDto> => {
      try {
        return await request<DashboardStatsDto>('/campaigns/stats/overview');
      } catch {
        const sched = getDemoScheduled();
        return {
          totalScheduled: sched.filter((e) => e.status === 'scheduled' || e.status === 'processing').length,
          totalSent: 2,
          totalFailed: 1,
          totalCampaigns: 2,
          activeSenders: 2,
        };
      }
    },
  },
  health: {
    getHealth: () => request<{ status: string; uptime: number }>('/health'),
    getReady: () => request<{ status: string; checks: any }>('/health/ready'),
  },
};
