import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// GET /api/user/profile
router.get('/profile', requireAuth, (req, res) => {
  res.json({
    user: {
      id: req.user?.id,
      email: req.user?.email,
      name: req.user?.name,
      image: req.user?.image,
      createdAt: req.user?.createdAt,
    },
  });
});

// GET /api/user/count - Get total user count (public endpoint)
router.get('/count', async (req, res) => {
  try {
    const userCount = await prisma.user.count();
    res.json({
      success: true,
      count: userCount,
    });
  } catch (error) {
    console.error('Error fetching user count:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user count',
    });
  }
});

export { router as userRouter };
