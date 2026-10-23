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

const API_BASE = '/api';

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

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // essential for HTTP-only cookies
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.success === false) {
    throw new ApiError(
      data.error?.message || `Request failed with status ${res.status}`,
      data.error?.code,
      res.status,
      data.error?.details
    );
  }

  return (data.data !== undefined ? data.data : data) as T;
}

export const api = {
  auth: {
    getMe: () => request<UserDto & { senders: SenderDto[] }>('/auth/me'),
    logout: () => request<{ message: string }>('/auth/logout', { method: 'POST' }),
  },
  emails: {
    schedule: (payload: ScheduleEmailInput) =>
      request<ScheduleEmailResponseData>('/emails/schedule', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    getScheduled: (page = 1, limit = 20, search?: string) => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.append('search', search);
      return request<PaginatedResponse<EmailDto>>(`/emails/scheduled?${params.toString()}`);
    },
    getSent: (page = 1, limit = 20, search?: string) => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (search) params.append('search', search);
      return request<PaginatedResponse<EmailDto>>(`/emails/sent?${params.toString()}`);
    },
    getById: (id: string) => request<EmailDto>(`/emails/${id}`),
    cancel: (id: string) => request<EmailDto>(`/emails/${id}/cancel`, { method: 'POST' }),
  },
  senders: {
    list: () => request<SenderDto[]>('/senders'),
    create: (payload: Partial<SenderDto>) =>
      request<SenderDto>('/senders', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },
  campaigns: {
    list: () => request<CampaignDto[]>('/campaigns'),
    getStats: () => request<DashboardStatsDto>('/campaigns/stats/overview'),
  },
  health: {
    getHealth: () => request<{ status: string; uptime: number }>('/health'),
    getReady: () => request<{ status: string; checks: any }>('/health/ready'),
  },
};
