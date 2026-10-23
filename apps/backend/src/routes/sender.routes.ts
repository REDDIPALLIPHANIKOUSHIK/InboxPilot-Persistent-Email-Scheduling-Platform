import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { SenderService } from '../services/sender.service.js';
import { createSenderSchema, updateSenderSchema } from '@inboxpilot/shared';

export const senderRouter = Router();

// GET /api/senders
senderRouter.get('/', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const senders = await SenderService.getSenders(req.user!.id);
    res.json({
      success: true,
      data: senders,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/senders
senderRouter.post('/', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const validated = createSenderSchema.parse(req.body);
    const created = await SenderService.createSender(req.user!.id, validated);
    res.status(201).json({
      success: true,
      data: created,
    });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/senders/:id
senderRouter.patch('/:id', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const validated = updateSenderSchema.parse(req.body);
    const updated = await SenderService.updateSender(req.user!.id, req.params.id, validated);
    res.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
});
