import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../../middleware/requireAuth';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

// Simple admin check middleware (in production, you'd want proper role-based access)
const requireAdmin = async (req: any, res: any, next: any) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // For now, we'll use a simple check - in production, you'd have a proper admin role system
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true }
    });

    // Simple admin check - you can modify this logic
    const isAdmin = user?.email?.includes('admin') || user?.email?.includes('moderator');
    
    if (!isAdmin) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Get all reviews for moderation
router.get('/reviews', requireAuth, requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string || 'all';

    const skip = (page - 1) * limit;

    const where: any = {};
    if (status === 'pending') {
      where.isApproved = false;
    } else if (status === 'approved') {
      where.isApproved = true;
    } else if (status === 'visible') {
      where.isApproved = true;
      where.isVisible = true;
    }

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
          likes: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.review.count({ where }),
    ]);

    res.json({
      reviews,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching reviews for moderation:', error);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// Get all suggestions for moderation
router.get('/suggestions', requireAuth, requireAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string || 'all';

    const skip = (page - 1) * limit;

    const where: any = {};
    if (status === 'pending') {
      where.isApproved = false;
    } else if (status === 'approved') {
      where.isApproved = true;
    } else if (status === 'visible') {
      where.isApproved = true;
      where.isVisible = true;
    }

    const [suggestions, total] = await Promise.all([
      prisma.suggestion.findMany({
        where,
        include: {
          user: {
            select: {
              name: true,
              email: true,
            },
          },
          likes: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
      prisma.suggestion.count({ where }),
    ]);

    res.json({
      suggestions,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching suggestions for moderation:', error);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// Approve a review
router.put('/reviews/:id/approve', requireAuth, requireAdmin, async (req, res) => {
  try {
    const reviewId = req.params.id;
    const { isApproved, isVisible } = req.body;

    const review = await prisma.review.update({
      where: { id: reviewId },
      data: {
        isApproved: isApproved ?? true,
        isVisible: isVisible ?? true,
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        likes: true,
      },
    });

    res.json(review);
  } catch (error) {
    console.error('Error approving review:', error);
    res.status(500).json({ error: 'Failed to approve review' });
  }
});

// Approve a suggestion
router.put('/suggestions/:id/approve', requireAuth, requireAdmin, async (req, res) => {
  try {
    const suggestionId = req.params.id;
    const { isApproved, isVisible } = req.body;

    const suggestion = await prisma.suggestion.update({
      where: { id: suggestionId },
      data: {
        isApproved: isApproved ?? true,
        isVisible: isVisible ?? true,
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        likes: true,
      },
    });

    res.json(suggestion);
  } catch (error) {
    console.error('Error approving suggestion:', error);
    res.status(500).json({ error: 'Failed to approve suggestion' });
  }
});

// Reject a review
router.put('/reviews/:id/reject', requireAuth, requireAdmin, async (req, res) => {
  try {
    const reviewId = req.params.id;

    const review = await prisma.review.update({
      where: { id: reviewId },
      data: {
        isApproved: false,
        isVisible: false,
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        likes: true,
      },
    });

    res.json(review);
  } catch (error) {
    console.error('Error rejecting review:', error);
    res.status(500).json({ error: 'Failed to reject review' });
  }
});

// Reject a suggestion
router.put('/suggestions/:id/reject', requireAuth, requireAdmin, async (req, res) => {
  try {
    const suggestionId = req.params.id;

    const suggestion = await prisma.suggestion.update({
      where: { id: suggestionId },
      data: {
        isApproved: false,
        isVisible: false,
      },
      include: {
        user: {
          select: {
            name: true,
            email: true,
          },
        },
        likes: true,
      },
    });

    res.json(suggestion);
  } catch (error) {
    console.error('Error rejecting suggestion:', error);
    res.status(500).json({ error: 'Failed to reject suggestion' });
  }
});

// Delete a review (admin only)
router.delete('/reviews/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const reviewId = req.params.id;

    await prisma.review.delete({
      where: { id: reviewId },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({ error: 'Failed to delete review' });
  }
});

// Delete a suggestion (admin only)
router.delete('/suggestions/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const suggestionId = req.params.id;

    await prisma.suggestion.delete({
      where: { id: suggestionId },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting suggestion:', error);
    res.status(500).json({ error: 'Failed to delete suggestion' });
  }
});

// Get moderation statistics
router.get('/stats', requireAuth, requireAdmin, async (req, res) => {
  try {
    const [
      totalReviews,
      pendingReviews,
      approvedReviews,
      totalSuggestions,
      pendingSuggestions,
      approvedSuggestions,
    ] = await Promise.all([
      prisma.review.count(),
      prisma.review.count({ where: { isApproved: false } }),
      prisma.review.count({ where: { isApproved: true } }),
      prisma.suggestion.count(),
      prisma.suggestion.count({ where: { isApproved: false } }),
      prisma.suggestion.count({ where: { isApproved: true } }),
    ]);

    res.json({
      reviews: {
        total: totalReviews,
        pending: pendingReviews,
        approved: approvedReviews,
      },
      suggestions: {
        total: totalSuggestions,
        pending: pendingSuggestions,
        approved: approvedSuggestions,
      },
    });
  } catch (error) {
    console.error('Error fetching moderation stats:', error);
    res.status(500).json({ error: 'Failed to fetch moderation statistics' });
  }
});

export default router;
