import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../../middleware/requireAuth';
import { AuthService, Permission } from '../../types/permissions';

const router = Router();
const prisma = new PrismaClient();

// ===== GROUPS =====

// Create a new group
const createGroupSchema = z.object({
  name: z.string().min(1).max(100),
  slug: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  description: z.string().max(500).optional(),
  rules: z.string().max(2000).optional(),
  visibility: z.enum(['public', 'private', 'restricted']).default('public'),
  settings: z.object({
    postApprovalRequired: z.boolean().default(false),
    allowReactions: z.boolean().default(true),
    allowExternalEmbeds: z.boolean().default(true),
    defaultSorting: z.enum(['new', 'top', 'trending']).default('new')
  }).default({})
});

router.post('/groups', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const validatedData = createGroupSchema.parse(req.body);

    // Check if slug is already taken
    const existingGroup = await prisma.group.findUnique({
      where: { slug: validatedData.slug }
    });

    if (existingGroup) {
      return res.status(400).json({ error: 'Group slug already exists' });
    }

    const group = await prisma.group.create({
      data: {
        ...validatedData,
        ownerId: userId,
        members: {
          create: {
            userId: userId,
            role: 'owner',
            status: 'active'
          }
        }
      },
      include: {
        owner: {
          select: { id: true, name: true, handle: true, image: true }
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, handle: true, image: true }
            }
          }
        },
        _count: {
          select: { members: true, posts: true }
        }
      }
    });

    res.status(201).json({
      success: true,
      group
    });
  } catch (error) {
    next(error);
  }
});

// Get groups
router.get('/groups', async (req, res, next) => {
  try {
    const { page = 1, limit = 20, visibility = 'public' } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const groups = await prisma.group.findMany({
      where: {
        isActive: true,
        visibility: visibility as string
      },
      include: {
        owner: {
          select: { id: true, name: true, handle: true, image: true }
        },
        _count: {
          select: { members: true, posts: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit)
    });

    const total = await prisma.group.count({
      where: {
        isActive: true,
        visibility: visibility as string
      }
    });

    res.json({
      success: true,
      groups,
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

// Get single group
router.get('/groups/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;

    const group = await prisma.group.findUnique({
      where: { slug },
      include: {
        owner: {
          select: { id: true, name: true, handle: true, image: true }
        },
        members: {
          include: {
            user: {
              select: { id: true, name: true, handle: true, image: true }
            }
          },
          orderBy: { joinedAt: 'desc' },
          take: 10
        },
        _count: {
          select: { members: true, posts: true }
        }
      }
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    res.json({
      success: true,
      group
    });
  } catch (error) {
    next(error);
  }
});

// Join group
router.post('/groups/:slug/join', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const { slug } = req.params;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const group = await prisma.group.findUnique({
      where: { slug }
    });

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    // Check if user is already a member
    const existingMembership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: group.id,
          userId: userId
        }
      }
    });

    if (existingMembership) {
      return res.status(400).json({ error: 'Already a member of this group' });
    }

    const membership = await prisma.groupMember.create({
      data: {
        groupId: group.id,
        userId: userId,
        role: 'member',
        status: group.visibility === 'public' ? 'active' : 'pending'
      },
      include: {
        user: {
          select: { id: true, name: true, handle: true, image: true }
        }
      }
    });

    res.status(201).json({
      success: true,
      membership
    });
  } catch (error) {
    next(error);
  }
});

// ===== POSTS =====

// Create a new post (simplified version without groups for now)
const createPostSchema = z.object({
  title: z.string().max(200).optional(),
  content: z.string().min(1).max(10000),
  media: z.array(z.object({
    type: z.enum(['image', 'video', 'file']),
    url: z.string(),
    filename: z.string(),
    size: z.number(),
    mimeType: z.string()
  })).optional(),
  ogPreview: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    image: z.string().optional(),
    url: z.string()
  }).optional(),
  scheduledFor: z.string().datetime().optional()
});

router.post('/posts', async (req, res, next) => {
  try {
    const { title, content } = req.body;
    const userId = req.headers['x-user-id'] as string;
    const userName = req.headers['x-user-name'] as string;
    const userEmail = req.headers['x-user-email'] as string;

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Content is required'
      });
    }

    // For now, return a mock created post since we don't have the posts table yet
    const newPost = {
      id: Date.now().toString(),
      title: title?.trim() || null,
      content: content.trim(),
      status: 'published', // Add status field
      author: {
        id: userId || '1',
        name: userName || 'Anonymous User',
        handle: userName?.toLowerCase().replace(/\s+/g, '_') || 'anonymous',
        image: null
      },
      isPinned: false,
      viewCount: 0,
      reactionCount: 0,
      commentCount: 0,
      createdAt: new Date().toISOString(),
      _count: {
        comments: 0,
        reactions: 0
      }
    };

    res.status(201).json({
      success: true,
      post: newPost,
      message: 'Post erfolgreich erstellt!'
    });
  } catch (error) {
    next(error);
  }
});

// Get posts with sorting (simplified - no groups)
router.get('/posts', async (req, res, next) => {
  try {
    const { 
      sort = 'new', 
      page = 1, 
      limit = 20,
      cursor,
      search
    } = req.query;

    const skip = cursor ? 0 : (Number(page) - 1) * Number(limit);

    let orderBy: any = { createdAt: 'desc' };
    
    switch (sort) {
      case 'top':
        orderBy = { reactionCount: 'desc' };
        break;
      case 'trending':
        // Simplified trending algorithm
        orderBy = [
          { reactionCount: 'desc' },
          { createdAt: 'desc' }
        ];
        break;
      default:
        orderBy = { createdAt: 'desc' };
    }

    const where: any = {
      // For mock data, we don't need status filtering
    };

    if (cursor) {
      where.id = { lt: cursor };
    }

    // For now, return mock data since we don't have the posts table yet
    const allMockPosts = [
      {
        id: '1',
        title: 'Meine ersten Erfahrungen mit Mikrodosierung',
        content: 'Ich habe vor 2 Wochen mit der Mikrodosierung begonnen und bin begeistert von den ersten Ergebnissen. Meine Konzentration hat sich deutlich verbessert und ich fühle mich insgesamt ausgeglichener.',
        status: 'published',
        author: {
          id: '1',
          name: 'Max Mustermann',
          handle: 'max_m',
          image: null
        },
        isPinned: false,
        viewCount: 42,
        reactionCount: 8,
        commentCount: 3,
        createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        _count: {
          comments: 3,
          reactions: 8
        }
      },
      {
        id: '2',
        title: 'Tipps für Anfänger',
        content: 'Hier sind meine wichtigsten Tipps für alle, die gerade mit der Mikrodosierung anfangen: 1. Starte niedrig, 2. Führe ein Tagebuch, 3. Sei geduldig mit den Ergebnissen.',
        author: {
          id: '2',
          name: 'Anna Schmidt',
          handle: 'anna_s',
          image: null
        },
        isPinned: true,
        viewCount: 156,
        reactionCount: 23,
        commentCount: 7,
        createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        _count: {
          comments: 7,
          reactions: 23
        }
      },
      {
        id: '3',
        title: 'Protokoll-Vergleich: Fadiman vs. Stamets',
        content: 'Ich habe beide Protokolle ausprobiert und möchte meine Erfahrungen teilen. Das Fadiman-Protokoll war für mich als Anfänger besser geeignet, während Stamets für fortgeschrittene Anwender interessant ist.',
        author: {
          id: '3',
          name: 'Dr. Thomas Weber',
          handle: 'dr_weber',
          image: null
        },
        isPinned: false,
        viewCount: 89,
        reactionCount: 15,
        commentCount: 12,
        createdAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        _count: {
          comments: 12,
          reactions: 15
        }
      },
      {
        id: '4',
        title: 'Dosierung und Timing',
        content: 'Wann ist der beste Zeitpunkt für die Einnahme? Ich habe verschiedene Zeiten ausprobiert und finde morgens auf nüchternen Magen am besten.',
        author: {
          id: '4',
          name: 'Sarah Müller',
          handle: 'sarah_m',
          image: null
        },
        isPinned: false,
        viewCount: 67,
        reactionCount: 12,
        commentCount: 5,
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        _count: {
          comments: 5,
          reactions: 12
        }
      },
      {
        id: '5',
        title: 'Nebenwirkungen und Vorsicht',
        content: 'Wichtige Hinweise zu möglichen Nebenwirkungen und wann man die Mikrodosierung pausieren sollte.',
        author: {
          id: '5',
          name: 'Dr. Lisa Klein',
          handle: 'dr_klein',
          image: null
        },
        isPinned: false,
        viewCount: 203,
        reactionCount: 31,
        commentCount: 18,
        createdAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        _count: {
          comments: 18,
          reactions: 31
        }
      }
    ];

    // Filter posts based on search query
    let mockPosts = allMockPosts;
    if (search && typeof search === 'string') {
      const searchLower = search.toLowerCase();
      mockPosts = allMockPosts.filter(post => 
        post.title?.toLowerCase().includes(searchLower) ||
        post.content.toLowerCase().includes(searchLower) ||
        post.author.name.toLowerCase().includes(searchLower)
      );
    }

    res.json({
      success: true,
      posts: mockPosts,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        hasMore: false
      }
    });
  } catch (error) {
    next(error);
  }
});


// React to post (like/unlike)
router.post('/posts/:id/reactions', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-user-id'] as string;
    const userName = req.headers['x-user-name'] as string;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // For now, return mock success since we don't have the reactions table yet
    res.json({
      success: true,
      message: 'Post erfolgreich geliked!',
      reaction: {
        id: Date.now().toString(),
        postId: id,
        userId,
        type: 'like',
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    next(error);
  }
});

// Remove reaction from post
router.delete('/posts/:id/reactions', async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // For now, return mock success
    res.json({
      success: true,
      message: 'Like erfolgreich entfernt!'
    });
  } catch (error) {
    next(error);
  }
});

// Get comments for a post
router.get('/posts/:id/comments', async (req, res, next) => {
  try {
    const { id } = req.params;

    // Mock comments for now
    const mockComments = [
      {
        id: '1',
        content: 'Sehr interessant! Ich habe ähnliche Erfahrungen gemacht.',
        author: {
          id: '2',
          name: 'Anna Schmidt',
          handle: 'anna_s',
          image: null
        },
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        reactionCount: 3,
        hasReacted: false
      },
      {
        id: '2',
        content: 'Danke für die Tipps! Wann hast du mit der Mikrodosierung angefangen?',
        author: {
          id: '3',
          name: 'Dr. Thomas Weber',
          handle: 'dr_weber',
          image: null
        },
        createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        reactionCount: 1,
        hasReacted: false
      },
      {
        id: '3',
        content: 'Ich kann das bestätigen. Die Konzentration hat sich bei mir auch deutlich verbessert.',
        author: {
          id: '4',
          name: 'Sarah Müller',
          handle: 'sarah_m',
          image: null
        },
        createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
        reactionCount: 5,
        hasReacted: false
      }
    ];

    res.json({
      success: true,
      comments: mockComments
    });
  } catch (error) {
    next(error);
  }
});

// Create comment for a post
router.post('/posts/:id/comments', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.headers['x-user-id'] as string;
    const userName = req.headers['x-user-name'] as string;

    if (!content || !content.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Content is required'
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'User authentication required'
      });
    }

    // Mock created comment
    const newComment = {
      id: Date.now().toString(),
      content: content.trim(),
      author: {
        id: userId,
        name: userName || 'Anonymous User',
        handle: userName?.toLowerCase().replace(/\s+/g, '_') || 'anonymous',
        image: null
      },
      createdAt: new Date().toISOString(),
      reactionCount: 0,
      hasReacted: false
    };

    res.status(201).json({
      success: true,
      comment: newComment,
      message: 'Kommentar erfolgreich erstellt!'
    });
  } catch (error) {
    next(error);
  }
});

// Get single post
router.get('/posts/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const post = await prisma.post.findUnique({
      where: { id },
      include: {
        author: {
          select: { id: true, name: true, handle: true, image: true }
        },
        group: {
          select: { id: true, name: true, slug: true }
        },
        comments: {
          include: {
            author: {
              select: { id: true, name: true, handle: true, image: true }
            },
            _count: {
              select: { reactions: true }
            }
          },
          orderBy: { createdAt: 'asc' }
        },
        _count: {
          select: { comments: true, reactions: true }
        }
      }
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Increment view count
    await prisma.post.update({
      where: { id },
      data: { viewCount: { increment: 1 } }
    });

    res.json({
      success: true,
      post
    });
  } catch (error) {
    next(error);
  }
});

// ===== COMMENTS =====

// Create a comment
const createCommentSchema = z.object({
  postId: z.string(),
  parentId: z.string().optional(),
  content: z.string().min(1).max(2000)
});

router.post('/comments', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const validatedData = createCommentSchema.parse(req.body);

    // Check if post exists
    const post = await prisma.post.findUnique({
      where: { id: validatedData.postId },
      include: { group: true }
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check if user is member of the group
    const membership = await prisma.groupMember.findUnique({
      where: {
        groupId_userId: {
          groupId: post.groupId,
          userId: userId
        }
      }
    });

    if (!membership || membership.status !== 'active') {
      return res.status(403).json({ error: 'Not a member of this group' });
    }

    const comment = await prisma.comment.create({
      data: {
        ...validatedData,
        authorId: userId
      },
      include: {
        author: {
          select: { id: true, name: true, handle: true, image: true }
        },
        _count: {
          select: { reactions: true }
        }
      }
    });

    // Update comment count on post
    await prisma.post.update({
      where: { id: validatedData.postId },
      data: { commentCount: { increment: 1 } }
    });

    res.status(201).json({
      success: true,
      comment
    });
  } catch (error) {
    next(error);
  }
});

// ===== REACTIONS =====

// Add reaction
router.post('/reactions', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { targetType, targetId, type = 'like' } = req.body;

    // Check if reaction already exists
    const existingReaction = await prisma.reaction.findUnique({
      where: {
        targetType_targetId_userId: {
          targetType,
          targetId,
          userId
        }
      }
    });

    if (existingReaction) {
      // Toggle reaction
      await prisma.reaction.delete({
        where: { id: existingReaction.id }
      });

      // Update count
      if (targetType === 'post') {
        await prisma.post.update({
          where: { id: targetId },
          data: { reactionCount: { decrement: 1 } }
        });
      } else if (targetType === 'comment') {
        await prisma.comment.update({
          where: { id: targetId },
          data: { reactionCount: { decrement: 1 } }
        });
      }

      return res.json({
        success: true,
        action: 'removed',
        reaction: null
      });
    }

    // Create new reaction
    const reaction = await prisma.reaction.create({
      data: {
        targetType,
        targetId,
        userId,
        type
      }
    });

    // Update count
    if (targetType === 'post') {
      await prisma.post.update({
        where: { id: targetId },
        data: { reactionCount: { increment: 1 } }
      });
    } else if (targetType === 'comment') {
      await prisma.comment.update({
        where: { id: targetId },
        data: { reactionCount: { increment: 1 } }
      });
    }

    res.status(201).json({
      success: true,
      action: 'added',
      reaction
    });
  } catch (error) {
    next(error);
  }
});

// ===== SEARCH =====

router.get('/search', async (req, res, next) => {
  try {
    const { q, scope = 'posts', page = 1, limit = 20 } = req.query;

    if (!q || typeof q !== 'string') {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const skip = (Number(page) - 1) * Number(limit);

    let results: any[] = [];

    switch (scope) {
      case 'posts':
        results = await prisma.post.findMany({
          where: {
            status: 'published',
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { content: { contains: q, mode: 'insensitive' } }
            ]
          },
          include: {
            author: {
              select: { id: true, name: true, handle: true, image: true }
            },
            group: {
              select: { id: true, name: true, slug: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: Number(limit)
        });
        break;

      case 'users':
        results = await prisma.user.findMany({
          where: {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { handle: { contains: q, mode: 'insensitive' } }
            ]
          },
          select: {
            id: true,
            name: true,
            handle: true,
            image: true,
            bio: true
          },
          skip,
          take: Number(limit)
        });
        break;

      case 'groups':
        results = await prisma.group.findMany({
          where: {
            isActive: true,
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { description: { contains: q, mode: 'insensitive' } }
            ]
          },
          include: {
            owner: {
              select: { id: true, name: true, handle: true, image: true }
            },
            _count: {
              select: { members: true, posts: true }
            }
          },
          skip,
          take: Number(limit)
        });
        break;
    }

    res.json({
      success: true,
      results,
      query: q,
      scope,
      pagination: {
        page: Number(page),
        limit: Number(limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

export { router as communityRouter };
