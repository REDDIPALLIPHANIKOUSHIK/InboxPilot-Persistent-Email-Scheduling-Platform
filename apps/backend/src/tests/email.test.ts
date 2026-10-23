import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

describe('Email Endpoints Auth Guards', () => {
  it('POST /api/emails/schedule rejects unauthenticated requests with 401', async () => {
    const res = await request(app).post('/api/emails/schedule').send({
      subject: 'Test Subject',
      body: 'Test Body',
      recipients: ['test@example.com'],
      startAt: new Date().toISOString(),
      delayBetweenEmailsMs: 1000,
    });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/emails/scheduled rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/emails/scheduled');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/emails/sent rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/emails/sent');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});
