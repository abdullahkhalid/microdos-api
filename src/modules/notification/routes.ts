import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../../middleware/requireAuth';
import { NotificationService } from '../../services/notificationService';

const prisma = new PrismaClient();
const router = Router();

// GET /api/notification/list
router.get('/list', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { limit = 50, status } = req.query;

    const where: any = { userId };
    if (status) {
      where.status = status;
    }

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
    });

    res.json({
      success: true,
      notifications,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/notification/pending
router.get('/pending', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const pendingNotifications = await NotificationService.getPendingNotifications(userId);

    res.json({
      success: true,
      notifications: pendingNotifications,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/notification/mark-sent
router.post('/mark-sent', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { notificationId } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!notificationId) {
      return res.status(400).json({ error: 'Notification ID is required' });
    }

    // Verify the notification belongs to the user
    const notification = await prisma.notification.findFirst({
      where: {
        id: notificationId,
        userId,
      },
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const updatedNotification = await NotificationService.markAsSent(notificationId);

    res.json({
      success: true,
      notification: updatedNotification,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/notification/:id/status
router.put('/:id/status', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;
    const { status } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!status || !['scheduled', 'sent', 'delivered', 'failed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Verify the notification belongs to the user
    const notification = await prisma.notification.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const updateData: any = { status };
    if (status === 'sent' && !notification.sentAt) {
      updateData.sentAt = new Date();
    }

    const updatedNotification = await prisma.notification.update({
      where: { id },
      data: updateData,
    });

    res.json({
      success: true,
      notification: updatedNotification,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/notification/:id
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify the notification belongs to the user
    const notification = await prisma.notification.findFirst({
      where: {
        id,
        userId,
      },
    });

    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    await prisma.notification.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'Notification deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/notification/cleanup
router.post('/cleanup', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { daysOld = 30 } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Only allow cleanup of user's own notifications
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const deletedCount = await prisma.notification.deleteMany({
      where: {
        userId,
        createdAt: {
          lt: cutoffDate,
        },
        status: {
          in: ['sent', 'delivered', 'failed'],
        },
      },
    });

    res.json({
      success: true,
      deletedCount: deletedCount.count,
      message: `Cleaned up ${deletedCount.count} old notifications`,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
