import { Router } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { requireAuth } from '../../middleware/requireAuth';
import multer from 'multer';
import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';

const router = Router();
const prisma = new PrismaClient();

// Configure multer for file uploads (temporarily disabled)
// const storage = multer.memoryStorage();
// const upload = multer({
//   storage,
//   limits: {
//     fileSize: 10 * 1024 * 1024, // 10MB limit
//   },
//   fileFilter: (req, file, cb) => {
//     // Allow images and videos
//     const allowedTypes = /jpeg|jpg|png|gif|webp|mp4|mov|avi/;
//     const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
//     const mimetype = allowedTypes.test(file.mimetype);

//     if (mimetype && extname) {
//       return cb(null, true);
//     } else {
//       cb(new Error('Only image and video files are allowed'));
//     }
//   }
// });

// ===== MEDIA UPLOAD =====

// Upload single file (temporarily disabled)
router.post('/upload', requireAuth, async (req, res, next) => {
  try {
    return res.status(501).json({ error: 'Media upload temporarily disabled - dependencies not installed' });
    
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file provided' });
    }

    const { originalname, mimetype, size, buffer } = req.file;
    const fileId = uuidv4();
    const extension = path.extname(originalname);
    const filename = `${fileId}${extension}`;

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), 'uploads');
    await fs.mkdir(uploadsDir, { recursive: true });

    let processedBuffer = buffer;
    let thumbnailBuffer: Buffer | null = null;
    let width: number | undefined;
    let height: number | undefined;

    // Process image files
    if (mimetype.startsWith('image/')) {
      try {
        const image = sharp(buffer);
        const metadata = await image.metadata();
        width = metadata.width;
        height = metadata.height;

        // Resize if too large
        if (width && height && (width > 1920 || height > 1920)) {
          processedBuffer = await image
            .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 85 })
            .toBuffer();
        }

        // Create thumbnail
        thumbnailBuffer = await image
          .resize(300, 300, { fit: 'cover' })
          .jpeg({ quality: 80 })
          .toBuffer();
      } catch (error) {
        console.error('Image processing error:', error);
        return res.status(400).json({ error: 'Invalid image file' });
      }
    }

    // Save main file
    const filePath = path.join(uploadsDir, filename);
    await fs.writeFile(filePath, processedBuffer);

    // Save thumbnail if created
    let thumbnailUrl: string | undefined;
    if (thumbnailBuffer) {
      const thumbnailFilename = `${fileId}_thumb.jpg`;
      const thumbnailPath = path.join(uploadsDir, thumbnailFilename);
      await fs.writeFile(thumbnailPath, thumbnailBuffer);
      thumbnailUrl = `/uploads/${thumbnailFilename}`;
    }

    // Save to database
    const media = await prisma.media.create({
      data: {
        filename,
        originalName: originalname,
        mimeType: mimetype,
        size: processedBuffer.length,
        width,
        height,
        url: `/uploads/${filename}`,
        thumbnailUrl,
        uploadedBy: userId
      }
    });

    res.status(201).json({
      success: true,
      media: {
        id: media.id,
        filename: media.filename,
        originalName: media.originalName,
        mimeType: media.mimeType,
        size: media.size,
        width: media.width,
        height: media.height,
        url: media.url,
        thumbnailUrl: media.thumbnailUrl
      }
    });
  } catch (error) {
    next(error);
  }
});

// Upload multiple files (temporarily disabled)
router.post('/upload/multiple', requireAuth, async (req, res, next) => {
  try {
    return res.status(501).json({ error: 'Media upload temporarily disabled - dependencies not installed' });
    
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No files provided' });
    }

    const uploadPromises = files.map(async (file) => {
      const { originalname, mimetype, size, buffer } = file;
      const fileId = uuidv4();
      const extension = path.extname(originalname);
      const filename = `${fileId}${extension}`;

      // Create uploads directory if it doesn't exist
      const uploadsDir = path.join(process.cwd(), 'uploads');
      await fs.mkdir(uploadsDir, { recursive: true });

      let processedBuffer = buffer;
      let thumbnailBuffer: Buffer | null = null;
      let width: number | undefined;
      let height: number | undefined;

      // Process image files
      if (mimetype.startsWith('image/')) {
        try {
          const image = sharp(buffer);
          const metadata = await image.metadata();
          width = metadata.width;
          height = metadata.height;

          // Resize if too large
          if (width && height && (width > 1920 || height > 1920)) {
            processedBuffer = await image
              .resize(1920, 1920, { fit: 'inside', withoutEnlargement: true })
              .jpeg({ quality: 85 })
              .toBuffer();
          }

          // Create thumbnail
          thumbnailBuffer = await image
            .resize(300, 300, { fit: 'cover' })
            .jpeg({ quality: 80 })
            .toBuffer();
        } catch (error) {
          console.error('Image processing error:', error);
          throw new Error('Invalid image file');
        }
      }

      // Save main file
      const filePath = path.join(uploadsDir, filename);
      await fs.writeFile(filePath, processedBuffer);

      // Save thumbnail if created
      let thumbnailUrl: string | undefined;
      if (thumbnailBuffer) {
        const thumbnailFilename = `${fileId}_thumb.jpg`;
        const thumbnailPath = path.join(uploadsDir, thumbnailFilename);
        await fs.writeFile(thumbnailPath, thumbnailBuffer);
        thumbnailUrl = `/uploads/${thumbnailFilename}`;
      }

      // Save to database
      const media = await prisma.media.create({
        data: {
          filename,
          originalName: originalname,
          mimeType: mimetype,
          size: processedBuffer.length,
          width,
          height,
          url: `/uploads/${filename}`,
          thumbnailUrl,
          uploadedBy: userId
        }
      });

      return {
        id: media.id,
        filename: media.filename,
        originalName: media.originalName,
        mimeType: media.mimeType,
        size: media.size,
        width: media.width,
        height: media.height,
        url: media.url,
        thumbnailUrl: media.thumbnailUrl
      };
    });

    const uploadedMedia = await Promise.all(uploadPromises);

    res.status(201).json({
      success: true,
      media: uploadedMedia
    });
  } catch (error) {
    next(error);
  }
});

// Get signed upload URL (for direct client uploads to S3/CDN)
router.post('/upload/sign', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { filename, mimeType, size } = req.body;

    // In a real implementation, you would:
    // 1. Generate a signed URL for S3 or your CDN
    // 2. Return the signed URL and upload ID
    // 3. Client uploads directly to the signed URL
    // 4. Client calls /upload/complete with the upload ID

    // For now, return a mock response
    const uploadId = uuidv4();
    
    res.json({
      success: true,
      uploadId,
      signedUrl: `/api/community/media/upload/direct/${uploadId}`,
      expiresAt: new Date(Date.now() + 3600000) // 1 hour
    });
  } catch (error) {
    next(error);
  }
});

// Complete upload (after direct upload)
router.post('/upload/complete', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { uploadId, filename, mimeType, size, width, height } = req.body;

    // In a real implementation, you would:
    // 1. Verify the upload was successful
    // 2. Get the final URL from your CDN
    // 3. Create thumbnail if needed
    // 4. Save to database

    const media = await prisma.media.create({
      data: {
        filename,
        originalName: filename,
        mimeType,
        size,
        width,
        height,
        url: `/uploads/${filename}`, // This would be the CDN URL
        uploadedBy: userId
      }
    });

    res.status(201).json({
      success: true,
      media: {
        id: media.id,
        filename: media.filename,
        originalName: media.originalName,
        mimeType: media.mimeType,
        size: media.size,
        width: media.width,
        height: media.height,
        url: media.url,
        thumbnailUrl: media.thumbnailUrl
      }
    });
  } catch (error) {
    next(error);
  }
});

// ===== LINK PREVIEW =====

// Get link preview
router.post('/link-preview', async (req, res, next) => {
  try {
    const { url } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Check if we already have a cached preview
    const existingPreview = await prisma.linkPreview.findUnique({
      where: { url }
    });

    if (existingPreview && existingPreview.isValid) {
      return res.json({
        success: true,
        preview: {
          title: existingPreview.title,
          description: existingPreview.description,
          image: existingPreview.image,
          siteName: existingPreview.siteName,
          url: existingPreview.url
        }
      });
    }

    // In a real implementation, you would:
    // 1. Use a library like metascraper or unfurl.js
    // 2. Fetch the URL and extract OpenGraph/Twitter Card data
    // 3. Sanitize the content
    // 4. Cache the result

    // For now, return a mock response
    const preview = {
      title: 'Example Website',
      description: 'This is an example website description',
      image: 'https://example.com/image.jpg',
      siteName: 'Example Site',
      url: url
    };

    // Save to cache
    await prisma.linkPreview.upsert({
      where: { url },
      update: {
        title: preview.title,
        description: preview.description,
        image: preview.image,
        siteName: preview.siteName,
        lastChecked: new Date()
      },
      create: {
        url,
        title: preview.title,
        description: preview.description,
        image: preview.image,
        siteName: preview.siteName
      }
    });

    res.json({
      success: true,
      preview
    });
  } catch (error) {
    next(error);
  }
});

// ===== MEDIA MANAGEMENT =====

// Get user's uploaded media
router.get('/media', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const media = await prisma.media.findMany({
      where: { uploadedBy: userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: Number(limit)
    });

    const total = await prisma.media.count({
      where: { uploadedBy: userId }
    });

    res.json({
      success: true,
      media,
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

// Delete media
router.delete('/media/:id', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { id } = req.params;

    const media = await prisma.media.findUnique({
      where: { id }
    });

    if (!media) {
      return res.status(404).json({ error: 'Media not found' });
    }

    if (media.uploadedBy !== userId) {
      return res.status(403).json({ error: 'Not authorized to delete this media' });
    }

    // Delete file from filesystem
    try {
      const filePath = path.join(process.cwd(), 'uploads', media.filename);
      await fs.unlink(filePath);

      if (media.thumbnailUrl) {
        const thumbnailPath = path.join(process.cwd(), 'uploads', path.basename(media.thumbnailUrl));
        await fs.unlink(thumbnailPath);
      }
    } catch (error) {
      console.error('Error deleting file:', error);
    }

    // Delete from database
    await prisma.media.delete({
      where: { id }
    });

    res.json({
      success: true,
      message: 'Media deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

export { router as mediaRouter };
