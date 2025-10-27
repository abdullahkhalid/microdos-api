import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../../middleware/requireAuth';
import { NotificationService } from '../../services/notificationService';
import { createEvents } from 'ics';

const prisma = new PrismaClient();

const router = Router();

// Protocol creation schema
const createProtocolSchema = z.object({
  type: z.enum(['fadiman', 'stamets', 'custom']),
  name: z.string().min(1).max(100),
  startDate: z.string().datetime(),
  cycleLength: z.number().min(2).max(6),
  settings: z.object({
    // Fadiman: 1 day on, 2 days off
    fadiman: z.object({
      doseDays: z.array(z.number().min(0).max(6)).optional(), // 0=Sunday, 6=Saturday
    }).optional(),
    // Stamets: 4 days on, 3 days off
    stamets: z.object({
      doseDays: z.array(z.number().min(0).max(6)).optional(),
      nootropics: z.array(z.object({
        name: z.string(),
        dose: z.number(),
        unit: z.string(),
      })).optional(),
    }).optional(),
    // Custom: user-defined days
    custom: z.object({
      doseDays: z.array(z.number().min(0).max(6)),
      customName: z.string().optional(),
    }).optional(),
  }),
  notificationSettings: z.object({
    morningReminder: z.object({
      enabled: z.boolean(),
      time: z.string(), // HH:MM format
    }),
    eveningReflection: z.object({
      enabled: z.boolean(),
      time: z.string(), // HH:MM format
    }),
    channels: z.array(z.enum(['email', 'push'])),
  }),
});

// POST /api/protocol/create
router.post('/create', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if user has a microdose profile
    const profile = await prisma.microdoseProfile.findUnique({
      where: { userId },
    });

    if (!profile) {
      return res.status(400).json({ 
        error: 'Microdose profile required',
        message: 'Please complete the microdose calculator first before creating a protocol'
      });
    }

    const data = createProtocolSchema.parse(req.body);
    
    // Calculate end date (set to midnight UTC to avoid timezone issues)
    const startDate = new Date(data.startDate);
    startDate.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + (data.cycleLength * 7));
    endDate.setUTCHours(23, 59, 59, 999); // End of the last day

    // Validate protocol settings based on type
    if (data.type === 'fadiman') {
      // Fadiman: 1 day on, 2 days off (3-day cycle)
      // This will be handled in event generation
    } else if (data.type === 'stamets') {
      // Stamets: 4 days on, 3 days off (7-day cycle)
      // This will be handled in event generation
    } else if (data.type === 'custom') {
      // Custom: user-defined days
      if (!data.settings.custom?.doseDays || data.settings.custom.doseDays.length === 0) {
        return res.status(400).json({ error: 'Custom protocol requires dose days' });
      }
      
      // Validate minimum 3 rest days per week
      const doseDays = data.settings.custom.doseDays;
      if (doseDays.length > 4) {
        return res.status(400).json({ 
          error: 'Too many dose days',
          message: 'Maximum 4 dose days per week allowed for safety'
        });
      }
    }

    // Create protocol
    const protocol = await prisma.protocol.create({
      data: {
        userId,
        type: data.type,
        name: data.name,
        status: 'active',
        startDate,
        endDate,
        cycleLength: data.cycleLength,
        settings: data.settings,
        notificationSettings: data.notificationSettings,
      },
    });

    // Generate events based on protocol type
    console.log(`Generating events for protocol ${protocol.id} of type ${protocol.type}`);
    const events = await generateProtocolEvents(protocol, profile);
    console.log(`Generated ${events.length} events`);

    // Generate notifications for the protocol
    console.log(`Generating notifications for protocol ${protocol.id}`);
    const notifications = await NotificationService.generateProtocolNotifications(protocol, events);
    console.log(`Generated ${notifications.length} notifications`);

    // Create activity
    await prisma.userActivity.create({
      data: {
        userId,
        type: 'protocol_created',
        title: 'Protocol created',
        description: `${data.name} protocol (${data.type}) created for ${data.cycleLength} weeks`,
        metadata: {
          protocolId: protocol.id,
          protocolType: data.type,
          cycleLength: data.cycleLength,
        },
      },
    });

    res.json({
      success: true,
      protocol,
      events,
      notifications,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
    }
    next(error);
  }
});

// GET /api/protocol/list
router.get('/list', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const protocols = await prisma.protocol.findMany({
      where: { userId },
      include: {
        events: {
          orderBy: { date: 'asc' },
        },
        _count: {
          select: { events: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      protocols,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/protocol/:id
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const protocol = await prisma.protocol.findFirst({
      where: { 
        id,
        userId,
      },
      include: {
        events: {
          orderBy: { date: 'asc' },
          include: {
            journalEntries: true,
          },
        },
        _count: {
          select: { events: true },
        },
      },
    });

    if (!protocol) {
      return res.status(404).json({ error: 'Protocol not found' });
    }

    res.json({
      success: true,
      protocol,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/protocol/:id
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const protocol = await prisma.protocol.findFirst({
      where: { 
        id,
        userId,
      },
      include: {
        events: {
          include: {
            journalEntries: true,
          },
        },
      },
    });

    if (!protocol) {
      return res.status(404).json({ error: 'Protocol not found' });
    }

    // Check if any events have been started (completed, missed, or skipped)
    const startedEvents = protocol.events.filter(event => 
      event.status === 'completed' || event.status === 'missed' || event.status === 'skipped'
    );
    
    if (startedEvents.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete started protocol',
        message: 'Protocol cannot be deleted once events have been started'
      });
    }

    // Delete all related data in the correct order (due to foreign key constraints)
    
    // 1. Delete journal entries for all events
    const eventIds = protocol.events.map(event => event.id);
    if (eventIds.length > 0) {
      await prisma.journalEntry.deleteMany({
        where: {
          eventId: {
            in: eventIds,
          },
        },
      });
    }

    // 2. Delete all protocol events
    await prisma.protocolEvent.deleteMany({
      where: {
        protocolId: id,
      },
    });

    // 3. Delete notifications related to this protocol
    await prisma.notification.deleteMany({
      where: {
        userId,
        metadata: {
          path: ['protocolId'],
          equals: id,
        },
      },
    });

    // 4. Finally delete the protocol itself
    await prisma.protocol.delete({
      where: { id },
    });

    // Create activity
    await prisma.userActivity.create({
      data: {
        userId,
        type: 'protocol_deleted',
        title: 'Protocol deleted',
        description: `${protocol.name} protocol deleted`,
        metadata: {
          protocolId: protocol.id,
          protocolType: protocol.type,
        },
      },
    });

    res.json({
      success: true,
      message: 'Protocol deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

// Helper function to generate protocol events
async function generateProtocolEvents(protocol: any, profile: any) {
  const events = [];
  const startDate = new Date(protocol.startDate);
  const endDate = new Date(protocol.endDate);
  
  console.log(`Generating events from ${startDate.toISOString()} to ${endDate.toISOString()}`);
  console.log(`Protocol type: ${protocol.type}, Settings:`, protocol.settings);
  
  let currentDate = new Date(startDate);
  let dayCount = 0;
  
  while (currentDate <= endDate) {
    const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 6 = Saturday
    let isDoseDay = false;
    
    if (protocol.type === 'fadiman') {
      // Fadiman: 1 day on, 2 days off (3-day cycle)
      // Day 0: dose, Day 1: pause, Day 2: pause, Day 3: dose, etc.
      const daysSinceStart = Math.floor((currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      isDoseDay = daysSinceStart % 3 === 0;
    } else if (protocol.type === 'stamets') {
      // Stamets: 4 days on, 3 days off (7-day cycle)
      // Days 0-3: dose, Days 4-6: pause, Day 7: dose, etc.
      const daysSinceStart = Math.floor((currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const dayInCycle = daysSinceStart % 7;
      isDoseDay = dayInCycle < 4;
    } else if (protocol.type === 'custom') {
      // Custom: user-defined days based on selected weekdays
      const customSettings = protocol.settings.custom;
      if (customSettings && customSettings.doseDays) {
        isDoseDay = customSettings.doseDays.includes(dayOfWeek);
      }
    }
    
    console.log(`Day ${dayCount}: ${currentDate.toISOString().split('T')[0]} (${['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][dayOfWeek]}) - ${isDoseDay ? 'DOSE' : 'PAUSE'}`);
    
    // Create date without time (set to midnight UTC to avoid timezone issues)
    const eventDate = new Date(currentDate);
    eventDate.setUTCHours(0, 0, 0, 0);
    
    const event = await prisma.protocolEvent.create({
      data: {
        protocolId: protocol.id,
        date: eventDate,
        type: isDoseDay ? 'dose' : 'pause',
        status: 'scheduled',
        substance: isDoseDay ? profile.substance : null,
        dose: isDoseDay ? profile.calculatedDose : null,
        doseUnit: isDoseDay ? profile.doseUnit : null,
        metadata: {
          dayOfWeek,
          isDoseDay,
          protocolType: protocol.type,
          daysSinceStart: Math.floor((currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
        },
      },
    });
    
    events.push(event);
    currentDate.setDate(currentDate.getDate() + 1);
    dayCount++;
  }
  
  console.log(`Total events created: ${events.length}`);
  return events;
}

export default router;
