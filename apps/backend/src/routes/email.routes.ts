import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { EmailService } from '../services/email.service.js';
import { scheduleEmailSchema, emailQuerySchema } from '@inboxpilot/shared';

export const emailRouter = Router();

// POST /api/emails/schedule
emailRouter.post('/schedule', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const validatedData = scheduleEmailSchema.parse(req.body);
    const result = await EmailService.scheduleCampaign(req.user!.id, validatedData);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/emails/scheduled
emailRouter.get('/scheduled', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const query = emailQuerySchema.parse(req.query);
    const result = await EmailService.getScheduledEmails(
      req.user!.id,
      query.page,
      query.limit,
      query.search
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/emails/sent
emailRouter.get('/sent', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const query = emailQuerySchema.parse(req.query);
    const result = await EmailService.getSentEmails(
      req.user!.id,
      query.page,
      query.limit,
      query.search
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/emails/:id
emailRouter.get('/:id', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const result = await EmailService.getEmailById(req.user!.id, req.params.id);
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/emails/:id/cancel
emailRouter.post('/:id/cancel', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const result = await EmailService.cancelScheduledEmail(req.user!.id, req.params.id);
    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
});
