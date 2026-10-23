import { prisma } from '../lib/prisma.js';
import { AppError } from '../middleware/errorHandler.js';

export class CampaignService {
  public static async getCampaigns(userId: string) {
    const campaigns = await prisma.campaign.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        sender: true,
        _count: {
          select: { emails: true },
        },
      },
    });

    return campaigns;
  }

  public static async getCampaignById(userId: string, campaignId: string) {
    const campaign = await prisma.campaign.findFirst({
      where: { id: campaignId, userId },
      include: {
        sender: true,
        emails: {
          orderBy: { scheduledAt: 'asc' },
          take: 100,
        },
      },
    });

    if (!campaign) {
      throw new AppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
    }

    return campaign;
  }

  public static async getDashboardStats(userId: string) {
    const [totalScheduled, totalSent, totalFailed, totalCampaigns, activeSenders] = await Promise.all([
      prisma.email.count({
        where: { userId, status: { in: ['scheduled', 'processing'] } },
      }),
      prisma.email.count({
        where: { userId, status: 'sent' },
      }),
      prisma.email.count({
        where: { userId, status: 'failed' },
      }),
      prisma.campaign.count({
        where: { userId },
      }),
      prisma.sender.count({
        where: { userId },
      }),
    ]);

    return {
      totalScheduled,
      totalSent,
      totalFailed,
      totalCampaigns,
      activeSenders,
    };
  }
}
