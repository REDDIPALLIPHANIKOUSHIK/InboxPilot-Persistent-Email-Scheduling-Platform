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

export function isDemoModeActive(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(localStorage.getItem('inboxpilot_demo_session'));
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
// Interactive Local Storage Demo Store (ISOLATED from live backend data)
// -----------------------------------------------------------------------------
const INITIAL_DEMO_SCHEDULED: EmailDto[] = [
  {
    id: 'demo-sched-1',
    userId: 'demo-user-evaluator',
    campaignId: 'camp-demo-1',
    senderId: 'demo-sender-1',
    recipientEmail: 'sarah.jenkins@growthpartners.com',
    subject: 'Accelerate your outreach with InboxPilot',
    body: 'Hi Sarah,\n\nWe would love to show you how InboxPilot handles millions of persistent emails with zero dropped jobs.\n\nBest,\nInboxPilot Team',
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
      email: 'growth@inboxpilot.local',
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
    body: 'Hi Marcus,\n\nChecking in on our scheduled outreach discussion.\n\nBest,\nInboxPilot Team',
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
      email: 'growth@inboxpilot.local',
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
    body: 'Hi Alex,\n\nOur BullMQ delayed worker is currently processing this job.\n\nBest,\nInboxPilot Team',
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
      email: 'growth@inboxpilot.local',
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
    subject: 'Welcome to InboxPilot Platform',
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
    subject: 'Welcome to InboxPilot Platform',
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
    subject: 'Welcome to InboxPilot Platform',
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
// Real Fetch Request with Accurate Error Propagation
// -----------------------------------------------------------------------------
async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${endpoint}`;
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch (netErr: any) {
    throw new ApiError(
      `Cannot connect to backend API at ${baseUrl}. Ensure backend is running.`,
      'NETWORK_ERROR',
      0
    );
  }

  const contentType = res.headers.get('content-type') || '';
  let responseData: any = null;
  if (contentType.includes('application/json')) {
    try {
      responseData = await res.json();
    } catch {}
  }

  if (!res.ok) {
    const errorMsg =
      responseData?.error?.message ||
      responseData?.message ||
      `HTTP Error ${res.status}: ${res.statusText}`;
    const errorCode = responseData?.error?.code || 'API_ERROR';
    throw new ApiError(errorMsg, errorCode, res.status, responseData?.error?.details);
  }

  if (responseData && responseData.success === false) {
    const errorMsg = responseData?.error?.message || 'Operation failed';
    const errorCode = responseData?.error?.code || 'OPERATION_FAILED';
    throw new ApiError(errorMsg, errorCode, res.status, responseData?.error?.details);
  }

  return (responseData?.data !== undefined ? responseData.data : responseData) as T;
}

// Helper to handle demo mode schedule
function handleDemoSchedule(payload: ScheduleEmailInput): ScheduleEmailResponseData {
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
        email: 'growth@inboxpilot.local',
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

export const api = {
  auth: {
    getMe: async (): Promise<UserDto & { senders: SenderDto[] }> => {
      if (isDemoModeActive()) {
        const demo = localStorage.getItem('inboxpilot_demo_session');
        if (demo) return JSON.parse(demo);
        throw new ApiError('Not logged in', 'UNAUTHORIZED', 401);
      }
      return await request<UserDto & { senders: SenderDto[] }>('/auth/me');
    },
    logout: async () => {
      if (isDemoModeActive()) {
        localStorage.removeItem('inboxpilot_demo_session');
        return { message: 'Logged out from preview demo' };
      }
      return await request<{ message: string }>('/auth/logout', { method: 'POST' });
    },
  },
  emails: {
    schedule: async (payload: ScheduleEmailInput): Promise<ScheduleEmailResponseData> => {
      if (isDemoModeActive()) {
        return handleDemoSchedule(payload);
      }
      return await request<ScheduleEmailResponseData>('/emails/schedule', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    getScheduled: async (page = 1, limit = 10, search?: string): Promise<PaginatedResponse<EmailDto>> => {
      if (isDemoModeActive()) {
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
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.append('search', search);
      return await request<PaginatedResponse<EmailDto>>(`/emails/scheduled?${params.toString()}`);
    },
    getSent: async (page = 1, limit = 10, search?: string): Promise<PaginatedResponse<EmailDto>> => {
      if (isDemoModeActive()) {
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
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.append('search', search);
      return await request<PaginatedResponse<EmailDto>>(`/emails/sent?${params.toString()}`);
    },
    getById: async (id: string): Promise<EmailDto> => {
      if (isDemoModeActive()) {
        const all = [...getDemoScheduled(), ...INITIAL_DEMO_SENT];
        const found = all.find((e) => e.id === id);
        if (found) return found;
        throw new ApiError('Email not found in preview demo store', 'NOT_FOUND', 404);
      }
      return await request<EmailDto>(`/emails/${id}`);
    },
    cancel: async (id: string): Promise<EmailDto> => {
      if (isDemoModeActive()) {
        const current = getDemoScheduled();
        const found = current.find((e) => e.id === id);
        const filtered = current.filter((e) => e.id !== id);
        saveDemoScheduled(filtered);
        if (found) {
          return { ...found, status: 'cancelled' };
        }
        throw new ApiError('Email not found in preview demo store', 'NOT_FOUND', 404);
      }
      return await request<EmailDto>(`/emails/${id}/cancel`, { method: 'POST' });
    },
  },
  senders: {
    list: async (): Promise<SenderDto[]> => {
      if (isDemoModeActive()) {
        return [
          {
            id: 'demo-sender-1',
            userId: 'demo-user-evaluator',
            name: 'Growth Outreach',
            email: 'growth@inboxpilot.local',
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
            email: 'success@inboxpilot.local',
            isDefault: false,
            hourlyLimit: 150,
            minimumSendIntervalMs: 3000,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];
      }
      return await request<SenderDto[]>('/senders');
    },
    create: async (payload: Partial<SenderDto>): Promise<SenderDto> => {
      if (isDemoModeActive()) {
        return {
          id: `sender-${Date.now()}`,
          userId: 'demo-user-evaluator',
          name: payload.name || 'New Sender',
          email: payload.email || 'sender@inboxpilot.local',
          isDefault: false,
          hourlyLimit: payload.hourlyLimit || 200,
          minimumSendIntervalMs: payload.minimumSendIntervalMs || 2000,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }
      return await request<SenderDto>('/senders', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
  },
  campaigns: {
    list: async (): Promise<CampaignDto[]> => {
      if (isDemoModeActive()) {
        return [];
      }
      return await request<CampaignDto[]>('/campaigns');
    },
    getStats: async (): Promise<DashboardStatsDto> => {
      if (isDemoModeActive()) {
        const sched = getDemoScheduled();
        return {
          totalScheduled: sched.filter((e) => e.status === 'scheduled' || e.status === 'processing').length,
          totalSent: 2,
          totalFailed: 1,
          totalCampaigns: 2,
          activeSenders: 2,
        };
      }
      return await request<DashboardStatsDto>('/campaigns/stats/overview');
    },
  },
  health: {
    getHealth: () => request<{ status: string; uptime: number }>('/health'),
    getReady: () => request<{ status: string; checks: any }>('/health/ready'),
  },
};
