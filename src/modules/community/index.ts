import { Router } from 'express';
import { communityRouter } from './routes';
import { moderationRouter } from './moderation';
import { mediaRouter } from './media';
import { notificationRouter } from './notifications';

const router = Router();

// Mount all community routes
router.use('/', communityRouter);
router.use('/moderation', moderationRouter);
router.use('/media', mediaRouter);
router.use('/notifications', notificationRouter);

export { router as communityModule };
