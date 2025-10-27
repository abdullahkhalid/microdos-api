import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../../middleware/requireAuth';
import { z } from 'zod';

const router = Router();
const prisma = new PrismaClient();

// Debug route to check authentication
router.get('/debug/auth', requireAuth, async (req, res) => {
  res.json({
    user: req.user,
    session: req.session,
    authenticated: true
  });
});

// Test route to create review without authentication (for testing)
router.post('/test/review', async (req, res) => {
  try {
    console.log('Test review creation:', req.body);
    
    const { rating, comment } = req.body;
    
    if (!rating || !comment) {
      return res.status(400).json({ error: 'Rating and comment are required' });
    }
    
    // Find the first user to use as test user
    const testUser = await prisma.user.findFirst();
    if (!testUser) {
      return res.status(400).json({ error: 'No users found in database' });
    }
    
    const review = await prisma.review.create({
      data: {
        userId: testUser.id,
        rating: parseInt(rating),
        comment: comment,
        isApproved: true,
        isVisible: true,
      },
      include: {
        user: {
          select: {
            name: true,
          },
        },
        likes: true,
      },
    });
    
    console.log('Test review created:', review);
    res.json(review);
  } catch (error) {
    console.error('Error creating test review:', error);
    res.status(500).json({ error: 'Failed to create test review' });
  }
});

// Validation schemas
const createReviewSchema = z.object({
  rating: z.number().min(1).max(5),
  comment: z.string().min(1).max(1000),
});

const createSuggestionSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  category: z.enum(['UI/UX', 'Features', 'Microdoses', 'Werbung']),
});

const updateReviewSchema = z.object({
  rating: z.number().min(1).max(5).optional(),
  comment: z.string().min(1).max(1000).optional(),
});

const updateSuggestionSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().min(1).max(2000).optional(),
  category: z.enum(['UI/UX', 'Features', 'Microdoses', 'Werbung']).optional(),
});

// Get top reviews for landing page
router.get('/reviews/top', async (req, res) => {
  try {
    const reviews = await prisma.review.findMany({
      where: {
        isApproved: true,
        isVisible: true,
      },
      include: {
        user: {
          select: {
            name: true,
          },
        },
        likes: true,
      },
      orderBy: [
        { rating: 'desc' },
        { createdAt: 'desc' },
      ],
      take: 30,
    });

    res.json(reviews);
  } catch (error) {
    console.error('Error fetching top reviews:', error);
    res.status(500).json({ error: 'Failed to fetch top reviews' });
  }
});

// Get all reviews (with pagination and sorting)
router.get('/reviews', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const sortBy = req.query.sortBy as string || 'date';
    const sortOrder = req.query.sortOrder as string || 'desc';

    const skip = (page - 1) * limit;

    const orderBy: any = {};
    if (sortBy === 'rating') {
      orderBy.rating = sortOrder;
    } else {
      orderBy.createdAt = sortOrder;
    }

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where: {
          isApproved: true,
          isVisible: true,
        },
        include: {
          user: {
            select: {
              name: true,
            },
          },
          likes: true,
        },
        orderBy,
        skip,
        take: limit,
      }),
      prisma.review.count({
        where: {
          isApproved: true,
          isVisible: true,
        },
      }),
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
    console.error('Error fetching reviews:', error);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// Create a new review (with optional authentication)
router.post('/reviews', async (req, res) => {
  try {
    console.log('Review creation attempt:', {
      user: req.user,
      body: req.body,
      session: req.session,
      isAuthenticated: req.isAuthenticated(),
      sessionID: req.sessionID,
      passport: req.session?.passport,
      headers: {
        userId: req.headers['x-user-id'],
        userName: req.headers['x-user-name'],
        userEmail: req.headers['x-user-email']
      }
    });
    
    const validatedData = createReviewSchema.parse(req.body);
    
    let userId: string;
    let userName: string;
    
    // Check for user info in headers first (from frontend auth context)
    const headerUserId = req.headers['x-user-id'] as string;
    const headerUserName = req.headers['x-user-name'] as string;
    const headerUserEmail = req.headers['x-user-email'] as string;
    
    if (headerUserId && headerUserName && headerUserEmail) {
      // Use user from headers (frontend auth context)
      userId = headerUserId;
      userName = headerUserName;
    } else if (req.isAuthenticated() && req.user?.id) {
      // Use authenticated user from session
      userId = req.user.id;
      userName = req.user.name;
    } else {
      // Use anonymous user (find or create a default anonymous user)
      let anonymousUser = await prisma.user.findFirst({
        where: { email: 'anonymous@microdos.in' }
      });
      
      if (!anonymousUser) {
        anonymousUser = await prisma.user.create({
          data: {
            email: 'anonymous@microdos.in',
            name: 'Anonymous User',
            password: 'anonymous', // This won't be used for login
          }
        });
      }
      
      userId = anonymousUser.id;
      userName = 'Anonymous User';
    }

    const review = await prisma.review.create({
      data: {
        userId,
        rating: validatedData.rating,
        comment: validatedData.comment,
        isApproved: true, // Auto-approve reviews
        isVisible: true,
      },
      include: {
        user: {
          select: {
            name: true,
          },
        },
        likes: true,
      },
    });

    res.status(201).json(review);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid data', details: error.errors });
    }
    console.error('Error creating review:', error);
    res.status(500).json({ error: 'Failed to create review' });
  }
});

// Update own review
router.put('/reviews/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    const reviewId = req.params.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validatedData = updateReviewSchema.parse(req.body);

    // Check if review exists and belongs to user
    const existingReview = await prisma.review.findFirst({
      where: {
        id: reviewId,
        userId,
      },
    });

    if (!existingReview) {
      return res.status(404).json({ error: 'Review not found or not authorized' });
    }

    const review = await prisma.review.update({
      where: { id: reviewId },
      data: validatedData,
      include: {
        user: {
          select: {
            name: true,
          },
        },
        likes: true,
      },
    });

    res.json(review);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid data', details: error.errors });
    }
    console.error('Error updating review:', error);
    res.status(500).json({ error: 'Failed to update review' });
  }
});

// Delete own review (with optional authentication)
router.delete('/reviews/:id', async (req, res) => {
  try {
    const reviewId = req.params.id;
    
    // Check if review exists
    const existingReview = await prisma.review.findUnique({
      where: { id: reviewId },
      include: { user: true }
    });

    if (!existingReview) {
      return res.status(404).json({ error: 'Review not found' });
    }

    // Check for user info in headers first (from frontend auth context)
    const headerUserId = req.headers['x-user-id'] as string;
    const headerUserName = req.headers['x-user-name'] as string;
    const headerUserEmail = req.headers['x-user-email'] as string;
    
    if (headerUserId && headerUserName && headerUserEmail) {
      // Use user from headers (frontend auth context)
      if (existingReview.userId !== headerUserId) {
        return res.status(403).json({ error: 'Not authorized to delete this review' });
      }
    } else if (req.isAuthenticated() && req.user?.id) {
      // Use authenticated user from session
      if (existingReview.userId !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized to delete this review' });
      }
    } else {
      // For anonymous users, only allow deletion of anonymous reviews
      if (existingReview.user.email !== 'anonymous@microdos.in') {
        return res.status(403).json({ error: 'Authentication required to delete this review' });
      }
    }

    await prisma.review.delete({
      where: { id: reviewId },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting review:', error);
    res.status(500).json({ error: 'Failed to delete review' });
  }
});

// Like/Unlike a review
router.post('/reviews/:id/like', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    const reviewId = req.params.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if review exists
    const review = await prisma.review.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      return res.status(404).json({ error: 'Review not found' });
    }

    // Check if already liked
    const existingLike = await prisma.reviewLike.findUnique({
      where: {
        reviewId_userId: {
          reviewId,
          userId,
        },
      },
    });

    if (existingLike) {
      // Unlike
      await prisma.reviewLike.delete({
        where: {
          reviewId_userId: {
            reviewId,
            userId,
          },
        },
      });
      res.json({ liked: false });
    } else {
      // Like
      await prisma.reviewLike.create({
        data: {
          reviewId,
          userId,
        },
      });
      res.json({ liked: true });
    }
  } catch (error) {
    console.error('Error toggling review like:', error);
    res.status(500).json({ error: 'Failed to toggle like' });
  }
});

// Get all suggestions (public)
router.get('/suggestions', async (req, res) => {
  try {
    const suggestions = await prisma.suggestion.findMany({
      where: {
        isApproved: true,
        isVisible: true,
      },
      include: {
        likes: true,
        user: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    res.json(suggestions);
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
});

// Create a new suggestion (with optional authentication)
router.post('/suggestions', async (req, res) => {
  try {
    console.log('Suggestion creation attempt:', {
      user: req.user,
      body: req.body,
      session: req.session,
      isAuthenticated: req.isAuthenticated(),
      headers: {
        userId: req.headers['x-user-id'],
        userName: req.headers['x-user-name'],
        userEmail: req.headers['x-user-email']
      }
    });
    
    const validatedData = createSuggestionSchema.parse(req.body);
    
    let userId: string;
    
    // Check for user info in headers first (from frontend auth context)
    const headerUserId = req.headers['x-user-id'] as string;
    const headerUserName = req.headers['x-user-name'] as string;
    const headerUserEmail = req.headers['x-user-email'] as string;
    
    if (headerUserId && headerUserName && headerUserEmail) {
      // Use user from headers (frontend auth context)
      userId = headerUserId;
    } else if (req.isAuthenticated() && req.user?.id) {
      // Use authenticated user from session
      userId = req.user.id;
    } else {
      // Use anonymous user (find or create a default anonymous user)
      let anonymousUser = await prisma.user.findFirst({
        where: { email: 'anonymous@microdos.in' }
      });
      
      if (!anonymousUser) {
        anonymousUser = await prisma.user.create({
          data: {
            email: 'anonymous@microdos.in',
            name: 'Anonymous User',
            password: 'anonymous', // This won't be used for login
          }
        });
      }
      
      userId = anonymousUser.id;
    }

    const suggestion = await prisma.suggestion.create({
      data: {
        userId,
        title: validatedData.title,
        description: validatedData.description,
        category: validatedData.category,
        isApproved: true, // Auto-approve suggestions
        isVisible: true,
      },
      include: {
        likes: true,
        user: {
          select: {
            name: true,
          },
        },
      },
    });

    res.status(201).json(suggestion);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid data', details: error.errors });
    }
    console.error('Error creating suggestion:', error);
    res.status(500).json({ error: 'Failed to create suggestion' });
  }
});

// Update own suggestion
router.put('/suggestions/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    const suggestionId = req.params.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const validatedData = updateSuggestionSchema.parse(req.body);

    // Check if suggestion exists and belongs to user
    const existingSuggestion = await prisma.suggestion.findFirst({
      where: {
        id: suggestionId,
        userId,
      },
    });

    if (!existingSuggestion) {
      return res.status(404).json({ error: 'Suggestion not found or not authorized' });
    }

    const suggestion = await prisma.suggestion.update({
      where: { id: suggestionId },
      data: validatedData,
      include: {
        likes: true,
      },
    });

    res.json(suggestion);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid data', details: error.errors });
    }
    console.error('Error updating suggestion:', error);
    res.status(500).json({ error: 'Failed to update suggestion' });
  }
});

// Delete own suggestion (with optional authentication)
router.delete('/suggestions/:id', async (req, res) => {
  try {
    const suggestionId = req.params.id;
    
    // Check if suggestion exists
    const existingSuggestion = await prisma.suggestion.findUnique({
      where: { id: suggestionId },
      include: { user: true }
    });

    if (!existingSuggestion) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }

    // Check for user info in headers first (from frontend auth context)
    const headerUserId = req.headers['x-user-id'] as string;
    const headerUserName = req.headers['x-user-name'] as string;
    const headerUserEmail = req.headers['x-user-email'] as string;
    
    if (headerUserId && headerUserName && headerUserEmail) {
      // Use user from headers (frontend auth context)
      if (existingSuggestion.userId !== headerUserId) {
        return res.status(403).json({ error: 'Not authorized to delete this suggestion' });
      }
    } else if (req.isAuthenticated() && req.user?.id) {
      // Use authenticated user from session
      if (existingSuggestion.userId !== req.user.id) {
        return res.status(403).json({ error: 'Not authorized to delete this suggestion' });
      }
    } else {
      // For anonymous users, only allow deletion of anonymous suggestions
      if (existingSuggestion.user.email !== 'anonymous@microdos.in') {
        return res.status(403).json({ error: 'Authentication required to delete this suggestion' });
      }
    }

    await prisma.suggestion.delete({
      where: { id: suggestionId },
    });

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting suggestion:', error);
    res.status(500).json({ error: 'Failed to delete suggestion' });
  }
});

// Like/Unlike a suggestion
router.post('/suggestions/:id/like', requireAuth, async (req, res) => {
  try {
    const userId = req.user?.id;
    const suggestionId = req.params.id;

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check if suggestion exists
    const suggestion = await prisma.suggestion.findUnique({
      where: { id: suggestionId },
    });

    if (!suggestion) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }

    // Check if already liked
    const existingLike = await prisma.suggestionLike.findUnique({
      where: {
        suggestionId_userId: {
          suggestionId,
          userId,
        },
      },
    });

    if (existingLike) {
      // Unlike
      await prisma.suggestionLike.delete({
        where: {
          suggestionId_userId: {
            suggestionId,
            userId,
          },
        },
      });
      res.json({ liked: false });
    } else {
      // Like
      await prisma.suggestionLike.create({
        data: {
          suggestionId,
          userId,
        },
      });
      res.json({ liked: true });
    }
  } catch (error) {
    console.error('Error toggling suggestion like:', error);
    res.status(500).json({ error: 'Failed to toggle like' });
  }
});

export default router;
