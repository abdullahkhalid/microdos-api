import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../../middleware/requireAuth';

const prisma = new PrismaClient();

const router = Router();

// Journal entry creation schema
const createJournalEntrySchema = z.object({
  eventId: z.string(),
  type: z.enum(['intention', 'reflection', 'assessment']),
  content: z.object({
    // Intention fields
    categories: z.array(z.string()).optional(),
    customIntention: z.string().optional(),
    weights: z.record(z.number()).optional(),
    
    // Reflection fields
    effectiveness: z.record(z.number()).optional(), // category -> percentage
    domains: z.object({
      cognition: z.object({
        attention: z.number().min(1).max(7).optional(),
        memory: z.number().min(1).max(7).optional(),
        problemSolving: z.number().min(1).max(7).optional(),
      }).optional(),
      emotion: z.object({
        mood: z.number().min(1).max(7).optional(),
        resilience: z.number().min(1).max(7).optional(),
        emotionalRegulation: z.number().min(1).max(7).optional(),
      }).optional(),
      creativity: z.object({
        divergentThinking: z.number().min(1).max(7).optional(),
        inspiration: z.number().min(1).max(7).optional(),
        artisticExpression: z.number().min(1).max(7).optional(),
      }).optional(),
      sociability: z.object({
        empathy: z.number().min(1).max(7).optional(),
        communication: z.number().min(1).max(7).optional(),
        connectedness: z.number().min(1).max(7).optional(),
      }).optional(),
    }).optional(),
    
    // Assessment fields
    mood: z.number().min(1).max(5).optional(),
    energy: z.number().min(1).max(10).optional(),
    focus: z.number().min(1).max(10).optional(),
    creativity: z.number().min(1).max(10).optional(),
    socialConnection: z.number().min(1).max(10).optional(),
    journalText: z.string().max(500).optional(),
    
    // Clinical assessments
    phq8: z.array(z.number().min(0).max(3)).optional(), // 8 items
    gad7: z.array(z.number().min(0).max(3)).optional(), // 7 items
    panas: z.object({
      positive: z.array(z.number().min(1).max(5)).optional(), // 10 items
      negative: z.array(z.number().min(1).max(5)).optional(), // 10 items
    }).optional(),
    
    // Multimedia
    voiceNote: z.string().optional(), // Base64 encoded audio
    photo: z.string().optional(), // Base64 encoded image
    tags: z.array(z.string()).optional(),
  }),
});

// POST /api/journal/entry
router.post('/entry', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const data = createJournalEntrySchema.parse(req.body);
    
    // Verify event belongs to user
    const event = await prisma.protocolEvent.findFirst({
      where: {
        id: data.eventId,
        protocol: {
          userId,
        },
      },
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Create journal entry
    const journalEntry = await prisma.journalEntry.create({
      data: {
        eventId: data.eventId,
        type: data.type,
        content: data.content,
      },
    });

    // Create activity
    await prisma.userActivity.create({
      data: {
        userId,
        type: 'journal_entry_created',
        title: 'Journal-Eintrag erstellt',
        description: `${data.type === 'intention' ? 'Intention' : data.type === 'reflection' ? 'Reflexion' : 'Assessment'} für ${event.date.toLocaleDateString('de-DE')}`,
        metadata: {
          journalEntryId: journalEntry.id,
          eventId: data.eventId,
          type: data.type,
        },
      },
    });

    res.json({
      success: true,
      journalEntry,
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

// GET /api/journal/entries/:eventId
router.get('/entries/:eventId', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { eventId } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify event belongs to user
    const event = await prisma.protocolEvent.findFirst({
      where: {
        id: eventId,
        protocol: {
          userId,
        },
      },
    });

    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    // Get journal entries for this event
    const entries = await prisma.journalEntry.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
    });

    res.json({
      success: true,
      entries,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/journal/entries
router.get('/entries', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { type, limit = 50, offset = 0 } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Get journal entries for user's events
    const entries = await prisma.journalEntry.findMany({
      where: {
        event: {
          protocol: {
            userId,
          },
        },
        ...(type && { type: type as string }),
      },
      include: {
        event: {
          include: {
            protocol: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit as string),
      skip: parseInt(offset as string),
    });

    res.json({
      success: true,
      entries,
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/journal/entry/:id
router.put('/entry/:id', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const updateData = createJournalEntrySchema.partial().parse(req.body);

    // Verify journal entry belongs to user
    const existingEntry = await prisma.journalEntry.findFirst({
      where: {
        id,
        event: {
          protocol: {
            userId,
          },
        },
      },
    });

    if (!existingEntry) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }

    // Update journal entry
    const journalEntry = await prisma.journalEntry.update({
      where: { id },
      data: {
        content: {
          ...existingEntry.content as any,
          ...updateData.content,
        },
      },
    });

    res.json({
      success: true,
      journalEntry,
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

// DELETE /api/journal/entry/:id
router.delete('/entry/:id', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Verify journal entry belongs to user
    const existingEntry = await prisma.journalEntry.findFirst({
      where: {
        id,
        event: {
          protocol: {
            userId,
          },
        },
      },
    });

    if (!existingEntry) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }

    // Delete journal entry
    await prisma.journalEntry.delete({
      where: { id },
    });

    // Create activity
    await prisma.userActivity.create({
      data: {
        userId,
        type: 'journal_entry_deleted',
        title: 'Journal-Eintrag gelöscht',
        description: `Eintrag für ${existingEntry.event.date.toLocaleDateString('de-DE')} gelöscht`,
        metadata: {
          journalEntryId: id,
          type: existingEntry.type,
        },
      },
    });

    res.json({
      success: true,
      message: 'Journal entry deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/journal/adherence
router.get('/adherence', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { days = 365 } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(days as string));

    // Get all protocol events for the user
    const events = await prisma.protocolEvent.findMany({
      where: {
        protocol: {
          userId,
        },
        date: {
          gte: daysAgo,
        },
      },
      include: {
        protocol: true,
        journalEntries: true,
      },
      orderBy: { date: 'asc' },
    });

    // Calculate adherence data for heatmap
    const adherenceData: { [key: string]: number } = {};
    const totalDays = parseInt(days as string);
    
    // Initialize all days with 0
    for (let i = 0; i < totalDays; i++) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      adherenceData[dateKey] = 0;
    }

    // Process events and calculate adherence scores
    events.forEach(event => {
      const dateKey = event.date.toISOString().split('T')[0];
      let score = 0;
      
      // Base score based on event status
      switch (event.status) {
        case 'completed':
          score = 4; // Perfect adherence
          break;
        case 'missed':
          score = 1; // Poor adherence
          break;
        case 'skipped':
          score = 2; // Below average adherence
          break;
        case 'scheduled':
          score = 0; // Not yet completed
          break;
      }

      // Bonus points for journal entries
      if (event.journalEntries.length > 0) {
        const hasIntention = event.journalEntries.some(e => e.type === 'intention');
        const hasReflection = event.journalEntries.some(e => e.type === 'reflection');
        const hasAssessment = event.journalEntries.some(e => e.type === 'assessment');
        
        if (hasIntention) score += 0.5;
        if (hasReflection) score += 0.5;
        if (hasAssessment) score += 1.0;
      }

      // Cap at 5 (maximum score)
      adherenceData[dateKey] = Math.min(score, 5);
    });

    // Calculate overall adherence statistics
    const adherenceValues = Object.values(adherenceData);
    const totalScheduledDays = events.filter(e => e.status !== 'scheduled').length;
    const completedDays = events.filter(e => e.status === 'completed').length;
    const missedDays = events.filter(e => e.status === 'missed').length;
    const skippedDays = events.filter(e => e.status === 'skipped').length;
    
    const overallAdherence = totalScheduledDays > 0 ? (completedDays / totalScheduledDays) * 100 : 0;
    const averageScore = adherenceValues.length > 0 ? 
      adherenceValues.reduce((a, b) => a + b, 0) / adherenceValues.length : 0;

    res.json({
      success: true,
      adherence: {
        data: adherenceData,
        statistics: {
          overallAdherence: Math.round(overallAdherence),
          averageScore: Math.round(averageScore * 10) / 10,
          totalDays: totalScheduledDays,
          completedDays,
          missedDays,
          skippedDays,
          journalEntries: events.reduce((sum, event) => sum + event.journalEntries.length, 0),
        },
        timeRange: {
          start: daysAgo.toISOString().split('T')[0],
          end: new Date().toISOString().split('T')[0],
          days: totalDays,
        },
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/journal/analytics
router.get('/analytics', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { days = 30 } = req.query;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(days as string));

    // Get analytics data
    const entries = await prisma.journalEntry.findMany({
      where: {
        event: {
          protocol: {
            userId,
          },
        },
        createdAt: {
          gte: daysAgo,
        },
      },
      include: {
        event: {
          include: {
            protocol: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Process analytics
    const analytics = {
      totalEntries: entries.length,
      entriesByType: {
        intention: entries.filter(e => e.type === 'intention').length,
        reflection: entries.filter(e => e.type === 'reflection').length,
        assessment: entries.filter(e => e.type === 'assessment').length,
      },
      averageMetrics: {
        mood: 0,
        energy: 0,
        focus: 0,
        creativity: 0,
        socialConnection: 0,
      },
      intentionFulfillment: {},
      trends: [],
    };

    // Calculate average metrics
    const assessmentEntries = entries.filter(e => e.type === 'assessment');
    if (assessmentEntries.length > 0) {
      const metrics = ['mood', 'energy', 'focus', 'creativity', 'socialConnection'];
      metrics.forEach(metric => {
        const values = assessmentEntries
          .map(e => (e.content as any)[metric])
          .filter(v => v !== undefined);
        if (values.length > 0) {
          analytics.averageMetrics[metric as keyof typeof analytics.averageMetrics] = 
            values.reduce((a, b) => a + b, 0) / values.length;
        }
      });
    }

    // Calculate intention fulfillment
    const intentionEntries = entries.filter(e => e.type === 'intention');
    const reflectionEntries = entries.filter(e => e.type === 'reflection');
    
    if (intentionEntries.length > 0 && reflectionEntries.length > 0) {
      // Match intentions with reflections by date
      intentionEntries.forEach(intention => {
        const intentionDate = intention.createdAt.toDateString();
        const reflection = reflectionEntries.find(r => 
          r.createdAt.toDateString() === intentionDate
        );
        
        if (reflection) {
          const intentionCategories = (intention.content as any).categories || [];
          const effectiveness = (reflection.content as any).effectiveness || {};
          
          intentionCategories.forEach((category: string) => {
            if (!analytics.intentionFulfillment[category]) {
              analytics.intentionFulfillment[category] = [];
            }
            if (effectiveness[category] !== undefined) {
              analytics.intentionFulfillment[category].push(effectiveness[category]);
            }
          });
        }
      });
      
      // Calculate averages
      Object.keys(analytics.intentionFulfillment).forEach(category => {
        const values = analytics.intentionFulfillment[category];
        if (values.length > 0) {
          analytics.intentionFulfillment[category] = 
            values.reduce((a, b) => a + b, 0) / values.length;
        }
      });
    }

    res.json({
      success: true,
      analytics,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
