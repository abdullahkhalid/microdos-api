import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../../middleware/requireAuth';
import { AuthService, Permission, UserRole } from '../../types/permissions';

const router = Router();
const prisma = new PrismaClient();

// ===== REPORTS =====

// Create a report
const createReportSchema = z.object({
  targetType: z.enum(['post', 'comment', 'user', 'group']),
  targetId: z.string(),
  reason: z.enum(['spam', 'harassment', 'inappropriate', 'illegal', 'other']),
  description: z.string().max(1000).optional(),
  evidence: z.array(z.object({
    type: z.enum(['screenshot', 'link', 'text']),
    content: z.string()
  })).optional()
});

router.post('/reports', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const validatedData = createReportSchema.parse(req.body);

    // Check if target exists
    let targetExists = false;
    let groupId: string | null = null;

    switch (validatedData.targetType) {
      case 'post':
        const post = await prisma.post.findUnique({
          where: { id: validatedData.targetId },
          select: { id: true, groupId: true }
        });
        targetExists = !!post;
        groupId = post?.groupId || null;
        break;
      case 'comment':
        const comment = await prisma.comment.findUnique({
          where: { id: validatedData.targetId },
          include: { post: { select: { groupId: true } } }
        });
        targetExists = !!comment;
        groupId = comment?.post.groupId || null;
        break;
      case 'user':
        const user = await prisma.user.findUnique({
          where: { id: validatedData.targetId }
        });
        targetExists = !!user;
        break;
      case 'group':
        const group = await prisma.group.findUnique({
          where: { id: validatedData.targetId }
        });
        targetExists = !!group;
        groupId = validatedData.targetId;
        break;
    }

    if (!targetExists) {
      return res.status(404).json({ error: 'Target not found' });
    }

    // Check if user already reported this target
    const existingReport = await prisma.report.findFirst({
      where: {
        targetType: validatedData.targetType,
        targetId: validatedData.targetId,
        reporterId: userId
      }
    });

    if (existingReport) {
      return res.status(400).json({ error: 'Already reported this content' });
    }

    const report = await prisma.report.create({
      data: {
        ...validatedData,
        reporterId: userId,
        groupId
      },
      include: {
        reporter: {
          select: { id: true, name: true, handle: true }
        }
      }
    });

    res.status(201).json({
      success: true,
      report
    });
  } catch (error) {
    next(error);
  }
});

// Get reports for moderation
router.get('/reports', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if user has moderation permissions
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { globalRole: true }
    });

    if (!user || (user.globalRole !== UserRole.MODERATOR && user.globalRole !== UserRole.ADMIN)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { status = 'pending', page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const reports = await prisma.report.findMany({
      where: { status: status as string },
      include: {
        reporter: {
          select: { id: true, name: true, handle: true }
        },
        moderator: {
          select: { id: true, name: true, handle: true }
        },
        group: {
          select: { id: true, name: true, slug: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit)
    });

    const total = await prisma.report.count({
      where: { status: status as string }
    });

    res.json({
      success: true,
      reports,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    next(error);
  }
});

// ===== MODERATION ACTIONS =====

// Hide content
router.post('/moderation/hide', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { targetType, targetId, reason } = req.body;

    // Check moderation permissions
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { globalRole: true }
    });

    if (!user || (user.globalRole !== UserRole.MODERATOR && user.globalRole !== UserRole.ADMIN)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    let updatedContent;

    switch (targetType) {
      case 'post':
        updatedContent = await prisma.post.update({
          where: { id: targetId },
          data: { status: 'hidden' },
          include: {
            author: { select: { id: true, name: true, handle: true } }
          }
        });
        break;
      case 'comment':
        updatedContent = await prisma.comment.update({
          where: { id: targetId },
          data: { status: 'hidden' },
          include: {
            author: { select: { id: true, name: true, handle: true } }
          }
        });
        break;
      default:
        return res.status(400).json({ error: 'Invalid target type' });
    }

    // Log moderation action
    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'hide_content',
        targetType,
        targetId,
        details: { reason },
        metadata: {
          userAgent: req.get('User-Agent'),
          ip: req.ip
        }
      }
    });

    res.json({
      success: true,
      action: 'hidden',
      content: updatedContent
    });
  } catch (error) {
    next(error);
  }
});

// Remove content
router.post('/moderation/remove', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { targetType, targetId, reason } = req.body;

    // Check moderation permissions
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { globalRole: true }
    });

    if (!user || (user.globalRole !== UserRole.MODERATOR && user.globalRole !== UserRole.ADMIN)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    let updatedContent;

    switch (targetType) {
      case 'post':
        updatedContent = await prisma.post.update({
          where: { id: targetId },
          data: { status: 'removed' },
          include: {
            author: { select: { id: true, name: true, handle: true } }
          }
        });
        break;
      case 'comment':
        updatedContent = await prisma.comment.update({
          where: { id: targetId },
          data: { status: 'removed' },
          include: {
            author: { select: { id: true, name: true, handle: true } }
          }
        });
        break;
      default:
        return res.status(400).json({ error: 'Invalid target type' });
    }

    // Log moderation action
    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'remove_content',
        targetType,
        targetId,
        details: { reason },
        metadata: {
          userAgent: req.get('User-Agent'),
          ip: req.ip
        }
      }
    });

    res.json({
      success: true,
      action: 'removed',
      content: updatedContent
    });
  } catch (error) {
    next(error);
  }
});

// Pin/Unpin post
router.post('/moderation/pin', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { postId, action } = req.body; // action: 'pin' or 'unpin'

    // Check if user can moderate in this group
    const post = await prisma.post.findUnique({
      where: { id: postId },
      include: {
        group: {
          include: {
            members: {
              where: { userId }
            }
          }
        }
      }
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const userMembership = post.group.members[0];
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { globalRole: true }
    });

    // Check permissions
    const canModerate = 
      user?.globalRole === UserRole.ADMIN ||
      user?.globalRole === UserRole.MODERATOR ||
      userMembership?.role === 'moderator' ||
      userMembership?.role === 'owner';

    if (!canModerate) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const updatedPost = await prisma.post.update({
      where: { id: postId },
      data: { isPinned: action === 'pin' },
      include: {
        author: { select: { id: true, name: true, handle: true } },
        group: { select: { id: true, name: true, slug: true } }
      }
    });

    // Log moderation action
    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: action === 'pin' ? 'pin_post' : 'unpin_post',
        targetType: 'post',
        targetId: postId,
        details: { groupId: post.groupId },
        metadata: {
          userAgent: req.get('User-Agent'),
          ip: req.ip
        }
      }
    });

    res.json({
      success: true,
      action,
      post: updatedPost
    });
  } catch (error) {
    next(error);
  }
});

// Mute user
router.post('/moderation/mute', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { targetUserId, groupId, duration, reason } = req.body;

    // Check moderation permissions
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { globalRole: true }
    });

    if (!user || (user.globalRole !== UserRole.MODERATOR && user.globalRole !== UserRole.ADMIN)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Update user membership status
    const membership = await prisma.groupMember.update({
      where: {
        groupId_userId: {
          groupId,
          userId: targetUserId
        }
      },
      data: {
        status: 'muted',
        updatedAt: new Date()
      },
      include: {
        user: { select: { id: true, name: true, handle: true } }
      }
    });

    // Log moderation action
    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'mute_user',
        targetType: 'user',
        targetId: targetUserId,
        details: { groupId, duration, reason },
        metadata: {
          userAgent: req.get('User-Agent'),
          ip: req.ip
        }
      }
    });

    res.json({
      success: true,
      action: 'muted',
      membership
    });
  } catch (error) {
    next(error);
  }
});

// Ban user
router.post('/moderation/ban', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { targetUserId, groupId, reason } = req.body;

    // Check moderation permissions
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { globalRole: true }
    });

    if (!user || (user.globalRole !== UserRole.MODERATOR && user.globalRole !== UserRole.ADMIN)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    // Update user membership status
    const membership = await prisma.groupMember.update({
      where: {
        groupId_userId: {
          groupId,
          userId: targetUserId
        }
      },
      data: {
        status: 'banned',
        updatedAt: new Date()
      },
      include: {
        user: { select: { id: true, name: true, handle: true } }
      }
    });

    // Log moderation action
    await prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'ban_user',
        targetType: 'user',
        targetId: targetUserId,
        details: { groupId, reason },
        metadata: {
          userAgent: req.get('User-Agent'),
          ip: req.ip
        }
      }
    });

    res.json({
      success: true,
      action: 'banned',
      membership
    });
  } catch (error) {
    next(error);
  }
});

// Get audit logs
router.get('/moderation/audit-logs', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Check if user has permission to view audit logs
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { globalRole: true }
    });

    if (!user || (user.globalRole !== UserRole.MODERATOR && user.globalRole !== UserRole.ADMIN)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    const { page = 1, limit = 50, action, targetType } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {};
    if (action) where.action = action;
    if (targetType) where.targetType = targetType;

    const auditLogs = await prisma.auditLog.findMany({
      where,
      include: {
        actor: {
          select: { id: true, name: true, handle: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit)
    });

    const total = await prisma.auditLog.count({ where });

    res.json({
      success: true,
      auditLogs,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    next(error);
  }
});

export { router as moderationRouter };
