import { prisma } from '../lib/prisma.js';
import { CreateSenderInput, UpdateSenderInput } from '@inboxpilot/shared';
import { AppError } from '../middleware/errorHandler.js';

export class SenderService {
  public static async getSenders(userId: string) {
    return prisma.sender.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  public static async createSender(userId: string, input: CreateSenderInput) {
    if (input.isDefault) {
      // Unset other defaults
      await prisma.sender.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });
    }

    return prisma.sender.create({
      data: {
        userId,
        name: input.name,
        email: input.email.toLowerCase(),
        isDefault: input.isDefault ?? false,
        hourlyLimit: input.hourlyLimit ?? 200,
        minimumSendIntervalMs: input.minimumSendIntervalMs ?? 2000,
      },
    });
  }

  public static async updateSender(userId: string, senderId: string, input: UpdateSenderInput) {
    const existing = await prisma.sender.findFirst({
      where: { id: senderId, userId },
    });

    if (!existing) {
      throw new AppError('Sender identity not found', 404, 'SENDER_NOT_FOUND');
    }

    if (input.isDefault) {
      await prisma.sender.updateMany({
        where: { userId, isDefault: true, id: { not: senderId } },
        data: { isDefault: false },
      });
    }

    return prisma.sender.update({
      where: { id: senderId },
      data: {
        name: input.name ?? existing.name,
        email: input.email ? input.email.toLowerCase() : existing.email,
        isDefault: input.isDefault ?? existing.isDefault,
        hourlyLimit: input.hourlyLimit ?? existing.hourlyLimit,
        minimumSendIntervalMs: input.minimumSendIntervalMs ?? existing.minimumSendIntervalMs,
      },
    });
  }
}
