import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { authRouter } from './routes/auth.routes.js';
import { emailRouter } from './routes/email.routes.js';
import { campaignRouter } from './routes/campaign.routes.js';
import { senderRouter } from './routes/sender.routes.js';
import { healthRouter } from './routes/health.routes.js';
import { errorHandler } from './middleware/errorHandler.js';

export const app = express();

// Security and parsing middleware
app.use(
  cors({
    origin: [env.FRONTEND_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    credentials: true,
  })
);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser(env.SESSION_SECRET));

// API routes
app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/emails', emailRouter);
app.use('/api/campaigns', campaignRouter);
app.use('/api/senders', senderRouter);

// Central error handler
app.use(errorHandler);
