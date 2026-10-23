import { Router, Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import { AUTH_COOKIE_NAME, requireAuth } from '../middleware/auth.js';
import { env } from '../config/env.js';

export const authRouter = Router();

const STATE_COOKIE_NAME = 'inboxpilot_oauth_state';

// GET /api/auth/google
authRouter.get('/google', (req: Request, res: Response) => {
  const { url, state } = AuthService.generateAuthUrl();

  res.cookie(STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 10 * 60 * 1000, // 10 minutes
  });

  res.redirect(url);
});

// GET /api/auth/google/callback
authRouter.get('/google/callback', async (req: Request, res: Response, next) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent(String(error))}`);
      return;
    }

    if (!code || typeof code !== 'string') {
      res.redirect(`${env.FRONTEND_URL}/login?error=missing_code`);
      return;
    }

    const savedState = req.cookies?.[STATE_COOKIE_NAME];
    if (!savedState || savedState !== state) {
      res.redirect(`${env.FRONTEND_URL}/login?error=invalid_state_csrf`);
      return;
    }

    // Clear state cookie
    res.clearCookie(STATE_COOKIE_NAME);

    const { token } = await AuthService.handleGoogleCallback(code);

    // Set secure HTTP-only session cookie
    res.cookie(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    res.redirect(`${env.FRONTEND_URL}/`);
  } catch (err: any) {
    res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent(err.message || 'auth_failed')}`);
  }
});

// GET /api/auth/me
authRouter.get('/me', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const profile = await AuthService.getUserProfile(req.user!.id);
    res.json({
      success: true,
      data: profile,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
authRouter.post('/logout', (req: Request, res: Response) => {
  res.clearCookie(AUTH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: env.NODE_ENV === 'production' ? 'none' : 'lax',
  });

  res.json({
    success: true,
    data: { message: 'Logged out successfully' },
  });
});
