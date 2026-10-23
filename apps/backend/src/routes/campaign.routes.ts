import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { CampaignService } from '../services/campaign.service.js';

export const campaignRouter = Router();

// GET /api/campaigns
campaignRouter.get('/', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const campaigns = await CampaignService.getCampaigns(req.user!.id);
    res.json({
      success: true,
      data: campaigns,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/campaigns/stats/overview
campaignRouter.get('/stats/overview', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const stats = await CampaignService.getDashboardStats(req.user!.id);
    res.json({
      success: true,
      data: stats,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/campaigns/:id
campaignRouter.get('/:id', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const campaign = await CampaignService.getCampaignById(req.user!.id, req.params.id);
    res.json({
      success: true,
      data: campaign,
    });
  } catch (err) {
    next(err);
  }
});
