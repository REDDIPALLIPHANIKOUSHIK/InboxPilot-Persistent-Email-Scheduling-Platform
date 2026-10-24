import { describe, it, expect, beforeEach } from 'vitest';
import { getApiBaseUrl, isDemoModeActive, api, ApiError } from '../services/api.js';
import { parseLeadEmails, calculateScheduledAt } from '@inboxpilot/shared';

// Node test environment polyfill for browser storage & window
const storageMap = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => storageMap.set(key, String(value)),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};

globalThis.localStorage = localStorageMock as any;
globalThis.window = { localStorage: localStorageMock } as any;

describe('Frontend Services & UI Logic Suite', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('API URL Resolution & Configuration', () => {
    it('returns custom API URL when configured in localStorage', () => {
      localStorage.setItem('inboxpilot_custom_api_url', 'http://127.0.0.1:5000');
      const url = getApiBaseUrl();
      expect(url).toBe('http://127.0.0.1:5000/api');
    });

    it('falls back to default /api when no custom URL is provided', () => {
      localStorage.removeItem('inboxpilot_custom_api_url');
      const url = getApiBaseUrl();
      expect(url.endsWith('/api')).toBe(true);
    });
  });

  describe('Demo Mode Isolation & State Management', () => {
    it('detects demo mode active when inboxpilot_demo_session is set', () => {
      expect(isDemoModeActive()).toBe(false);

      localStorage.setItem('inboxpilot_demo_session', JSON.stringify({ id: 'demo-user-1' }));
      expect(isDemoModeActive()).toBe(true);
    });

    it('returns simulated user profile in demo mode without calling backend', async () => {
      const demoUser = {
        id: 'demo-user-evaluator',
        email: 'evaluator@inboxpilot.local',
        name: 'InboxPilot Evaluator',
        senders: [],
      };
      localStorage.setItem('inboxpilot_demo_session', JSON.stringify(demoUser));

      const profile = await api.auth.getMe();
      expect(profile.name).toBe('InboxPilot Evaluator');
      expect(profile.email).toBe('evaluator@inboxpilot.local');
    });

    it('filters scheduled emails by search query in demo mode', async () => {
      localStorage.setItem('inboxpilot_demo_session', JSON.stringify({ id: 'demo-user' }));

      // Search for jenkins
      const result = await api.emails.getScheduled(1, 10, 'jenkins');
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      expect(result.items[0].recipientEmail).toContain('jenkins');
    });

    it('paginates demo scheduled records correctly', async () => {
      localStorage.setItem('inboxpilot_demo_session', JSON.stringify({ id: 'demo-user' }));

      const page1 = await api.emails.getScheduled(1, 1);
      expect(page1.items.length).toBe(1);
      expect(page1.page).toBe(1);
      expect(page1.totalPages).toBeGreaterThanOrEqual(1);
    });

    it('simulates campaign scheduling and stores in demo state', async () => {
      localStorage.setItem('inboxpilot_demo_session', JSON.stringify({ id: 'demo-user' }));

      const schedulePayload = {
        name: 'Demo Product Update',
        subject: 'New Feature Announcement',
        body: 'Zero dropped jobs guaranteed.',
        recipients: ['alice@company.com', 'bob@company.com'],
        startAt: new Date(Date.now() + 60000).toISOString(),
        delayBetweenEmailsMs: 2000,
      };

      const res = await api.emails.schedule(schedulePayload);
      expect(res.totalAccepted).toBe(2);
      expect(res.campaign.name).toBe('Demo Product Update');

      // Verify the scheduled emails now appear in scheduled list
      const scheduled = await api.emails.getScheduled(1, 10, 'alice@company.com');
      expect(scheduled.items.length).toBe(1);
      expect(scheduled.items[0].recipientEmail).toBe('alice@company.com');
    });

    it('cancels scheduled email in demo mode and removes from queue', async () => {
      localStorage.setItem('inboxpilot_demo_session', JSON.stringify({ id: 'demo-user' }));

      const scheduledBefore = await api.emails.getScheduled(1, 10);
      const emailToCancel = scheduledBefore.items[0];

      const cancelled = await api.emails.cancel(emailToCancel.id);
      expect(cancelled.id).toBe(emailToCancel.id);
      expect(cancelled.status).toBe('cancelled');

      // Verify item is removed from active scheduled list
      const scheduledAfter = await api.emails.getScheduled(1, 10);
      const stillPresent = scheduledAfter.items.some((e) => e.id === emailToCancel.id);
      expect(stillPresent).toBe(false);
    });

    it('returns dashboard overview statistics in demo mode', async () => {
      localStorage.setItem('inboxpilot_demo_session', JSON.stringify({ id: 'demo-user' }));

      const stats = await api.campaigns.getStats();
      expect(stats.totalSent).toBeGreaterThanOrEqual(1);
      expect(stats.totalFailed).toBeGreaterThanOrEqual(1);
      expect(stats.activeSenders).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Lead Email Ingestion & CSV Parsing in UI Workflow', () => {
    it('parses mixed CSV input with headers, duplicates, and bad addresses', () => {
      const csvInput = `
Email,Name,Company
alex.chen@innovatecorp.io,Alex Chen,InnovateCorp
sarah.jenkins@growthpartners.com,Sarah Jenkins,Growth Partners
alex.chen@innovatecorp.io,Alex Chen,InnovateCorp
invalid-email-address,Bad Data,None
      `.trim();

      const parsed = parseLeadEmails(csvInput);
      expect(parsed.validUnique.length).toBe(2);
      expect(parsed.validUnique).toContain('alex.chen@innovatecorp.io');
      expect(parsed.validUnique).toContain('sarah.jenkins@growthpartners.com');
      expect(parsed.duplicates.length).toBe(1);
      expect(parsed.invalid.length).toBe(1);
    });

    it('calculates scheduled timestamp series with delay interval', () => {
      const baseTime = new Date('2026-10-25T10:00:00.000Z');
      const delayMs = 3000;

      const time0 = calculateScheduledAt(baseTime, 0, delayMs);
      const time1 = calculateScheduledAt(baseTime, 1, delayMs);
      const time2 = calculateScheduledAt(baseTime, 2, delayMs);

      expect(time0.getTime()).toBe(baseTime.getTime());
      expect(time1.getTime()).toBe(baseTime.getTime() + 3000);
      expect(time2.getTime()).toBe(baseTime.getTime() + 6000);
    });
  });

  describe('Error Propagation', () => {
    it('constructs ApiError with message, code, and status', () => {
      const err = new ApiError('Not found', 'NOT_FOUND', 404, { id: '123' });
      expect(err.name).toBe('ApiError');
      expect(err.message).toBe('Not found');
      expect(err.code).toBe('NOT_FOUND');
      expect(err.status).toBe(404);
      expect(err.details).toEqual({ id: '123' });
    });
  });
});
