import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';
import { AuthUserPayload } from '../middleware/auth.js';
import crypto from 'crypto';

export class AuthService {
  private static oauth2Client: OAuth2Client | null = null;

  public static getOAuth2Client(): OAuth2Client {
    if (!this.oauth2Client) {
      if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
        throw new AppError(
          'Google OAuth 2.0 credentials are not configured. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file.',
          500,
          'OAUTH_NOT_CONFIGURED'
        );
      }

      this.oauth2Client = new OAuth2Client(
        env.GOOGLE_CLIENT_ID,
        env.GOOGLE_CLIENT_SECRET,
        env.GOOGLE_REDIRECT_URI
      );
    }
    return this.oauth2Client;
  }

  public static generateAuthUrl(): { url: string; state: string } {
    const client = this.getOAuth2Client();
    const state = crypto.randomBytes(32).toString('hex');

    const url = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['openid', 'email', 'profile'],
      state,
    });

    return { url, state };
  }

  public static async handleGoogleCallback(code: string): Promise<{ token: string; user: AuthUserPayload }> {
    const client = this.getOAuth2Client();

    let tokens;
    try {
      const response = await client.getToken(code);
      tokens = response.tokens;
    } catch (err: any) {
      throw new AppError(`Failed to exchange Google OAuth code: ${err.message}`, 400, 'OAUTH_CODE_EXCHANGE_FAILED');
    }

    if (!tokens.id_token) {
      throw new AppError('Google did not return an ID token', 400, 'NO_ID_TOKEN');
    }

    // Verify ID token with Google's public certs
    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: env.GOOGLE_CLIENT_ID,
      });
    } catch (err: any) {
      throw new AppError(`Failed to verify Google ID token: ${err.message}`, 400, 'INVALID_ID_TOKEN');
    }

    const payload = ticket.getPayload();
    if (!payload || !payload.sub || !payload.email) {
      throw new AppError('Invalid Google user profile data received', 400, 'INVALID_PROFILE');
    }

    const googleId = payload.sub;
    const email = payload.email.toLowerCase();
    const name = payload.name || payload.given_name || email.split('@')[0];
    const avatarUrl = payload.picture || null;

    // Upsert User in PostgreSQL
    const user = await prisma.user.upsert({
      where: { googleId },
      update: {
        name,
        email,
        avatarUrl,
      },
      create: {
        googleId,
        name,
        email,
        avatarUrl,
      },
    });

    // Ensure user has at least one default Sender
    const existingSender = await prisma.sender.findFirst({
      where: { userId: user.id },
    });

    if (!existingSender) {
      await prisma.sender.create({
        data: {
          userId: user.id,
          name: user.name,
          email: user.email,
          isDefault: true,
          hourlyLimit: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
          minimumSendIntervalMs: env.MIN_SEND_INTERVAL_MS,
        },
      });
    }

    const authPayload: AuthUserPayload = {
      id: user.id,
      email: user.email,
      name: user.name,
      googleId: user.googleId,
      avatarUrl: user.avatarUrl,
    };

    const token = jwt.sign(authPayload, env.JWT_SECRET, { expiresIn: '7d' });

    return { token, user: authPayload };
  }

  public static async getUserProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        senders: {
          orderBy: { isDefault: 'desc' },
        },
      },
    });

    if (!user) {
      throw new AppError('User not found', 404, 'USER_NOT_FOUND');
    }

    return user;
  }
}
