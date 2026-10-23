import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';

describe('Auth Endpoints', () => {
  it('GET /api/auth/me returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('POST /api/auth/logout clears auth cookie and succeeds', async () => {
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
