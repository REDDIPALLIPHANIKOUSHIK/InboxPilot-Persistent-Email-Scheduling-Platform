import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from './errorHandler.js';
import { prisma } from '../lib/prisma.js';

export interface AuthUserPayload {
  id: string;
  email: string;
  name: string;
  googleId: string;
  avatarUrl: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUserPayload;
    }
  }
}

export const AUTH_COOKIE_NAME = 'inboxpilot_session';

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    let token = req.cookies?.[AUTH_COOKIE_NAME];

    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      throw new AppError('Authentication required. Please log in.', 401, 'UNAUTHORIZED');
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthUserPayload;

    // Optional check that user still exists in database
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, name: true, googleId: true, avatarUrl: true },
    });

    if (!user) {
      throw new AppError('User account not found or has been removed.', 401, 'USER_NOT_FOUND');
    }

    req.user = user;
    next();
  } catch (err: any) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      next(new AppError('Session expired or invalid. Please log in again.', 401, 'INVALID_TOKEN'));
      return;
    }
    next(err);
  }
}
