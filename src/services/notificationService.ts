import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface NotificationData {
  userId: string;
  type: 'reminder' | 'reflection' | 'assessment';
  title: string;
  message: string;
  scheduledFor: Date;
  metadata?: any;
}

export class NotificationService {
  /**
   * Create a notification
   */
  static async createNotification(data: NotificationData) {
    return await prisma.notification.create({
      data: {
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        scheduledFor: data.scheduledFor,
        status: 'scheduled',
        metadata: data.metadata || {},
      },
    });
  }

  /**
   * Generate notifications for a protocol
   */
  static async generateProtocolNotifications(protocol: any, events: any[]) {
    const notifications = [];
    const { notificationSettings } = protocol;

    console.log(`Generating notifications for ${events.length} events`);
    console.log(`Notification settings:`, notificationSettings);

    for (const event of events) {
      const eventDate = new Date(event.date);
      
      // Morning reminder for dose days
      if (event.type === 'dose' && notificationSettings.morningReminder.enabled) {
        const reminderTime = notificationSettings.morningReminder.time.split(':');
        const reminderDate = new Date(eventDate);
        reminderDate.setHours(parseInt(reminderTime[0]), parseInt(reminderTime[1]), 0, 0);

        console.log(`Creating morning reminder for ${eventDate.toISOString().split('T')[0]} at ${reminderTime[0]}:${reminderTime[1]}`);

        const reminderNotification = await this.createNotification({
          userId: protocol.userId,
          type: 'reminder',
          title: 'Mikrodosis Erinnerung',
          message: `Zeit für Ihre ${event.substance} Mikrodosis (${event.dose} ${event.doseUnit})`,
          scheduledFor: reminderDate,
          metadata: {
            eventId: event.id,
            protocolId: protocol.id,
            eventType: event.type,
            substance: event.substance,
            dose: event.dose,
            doseUnit: event.doseUnit,
          },
        });

        notifications.push(reminderNotification);
      }

      // Evening reflection for dose days
      if (event.type === 'dose' && notificationSettings.eveningReflection.enabled) {
        const reflectionTime = notificationSettings.eveningReflection.time.split(':');
        const reflectionDate = new Date(eventDate);
        reflectionDate.setHours(parseInt(reflectionTime[0]), parseInt(reflectionTime[1]), 0, 0);

        console.log(`Creating evening reflection for ${eventDate.toISOString().split('T')[0]} at ${reflectionTime[0]}:${reflectionTime[1]}`);

        const reflectionNotification = await this.createNotification({
          userId: protocol.userId,
          type: 'reflection',
          title: 'Tagesreflexion',
          message: 'Wie war Ihr Tag? Nehmen Sie sich einen Moment für die Reflexion.',
          scheduledFor: reflectionDate,
          metadata: {
            eventId: event.id,
            protocolId: protocol.id,
            eventType: event.type,
          },
        });

        notifications.push(reflectionNotification);
      }
    }

    console.log(`Total notifications created: ${notifications.length}`);
    return notifications;
  }

  /**
   * Get pending notifications for a user
   */
  static async getPendingNotifications(userId: string) {
    return await prisma.notification.findMany({
      where: {
        userId,
        status: 'scheduled',
        scheduledFor: {
          lte: new Date(),
        },
      },
      orderBy: {
        scheduledFor: 'asc',
      },
    });
  }

  /**
   * Mark notification as sent
   */
  static async markAsSent(notificationId: string) {
    return await prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: 'sent',
        sentAt: new Date(),
      },
    });
  }

  /**
   * Get user's notification history
   */
  static async getUserNotifications(userId: string, limit: number = 50) {
    return await prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Delete old notifications (cleanup)
   */
  static async cleanupOldNotifications(daysOld: number = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    return await prisma.notification.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
        status: {
          in: ['sent', 'delivered', 'failed'],
        },
      },
    });
  }
}
