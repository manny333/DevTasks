import { Router, Response, Request } from 'express';
import multer from 'multer';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { requireTaskAccess } from '../lib/access';
import { storage } from '../lib/storage';

const router = Router();
router.use(authMiddleware);

// Multer: memory storage (buffer passed to StorageProvider)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only images (JPEG, PNG, GIF, WEBP) and PDFs are allowed'));
  },
});

// POST /api/tasks/:id/attachments — upload file
router.post('/:id/attachments', upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireTaskAccess(req, res)) return;
    if (!req.file) {
      res.status(400).json({ error: 'No file provided' });
      return;
    }

    const storageKey = await storage.save(req.file.buffer, req.file.originalname, req.file.mimetype);

    const attachment = await prisma.taskAttachment.create({
      data: {
        taskId: req.params.id as string,
        filename: req.file.originalname,
        storageKey,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
    });

    res.status(201).json({
      ...attachment,
      url: storage.getUrl(storageKey),
    });
  } catch (error: unknown) {
    if (error instanceof multer.MulterError || (error instanceof Error && error.message.includes('Only'))) {
      res.status(400).json({ error: (error as Error).message });
      return;
    }
    console.error('Upload attachment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/tasks/:id/attachments — list attachments for a task
router.get('/:id/attachments', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const access = await requireTaskAccess(req, res, false);
    if (access === null) return;

    const attachments = await prisma.taskAttachment.findMany({
      where: { taskId: req.params.id as string },
      orderBy: { createdAt: 'asc' },
    });

    res.json(attachments.map((a) => ({ ...a, url: storage.getUrl(a.storageKey) })));
  } catch (error) {
    console.error('Get attachments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/tasks/:id/attachments/:attachmentId — delete attachment
router.delete('/:id/attachments/:attachmentId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireTaskAccess(req, res)) return;

    const attachment = await prisma.taskAttachment.findFirst({
      where: { id: req.params.attachmentId as string, taskId: req.params.id as string },
    });
    if (!attachment) {
      res.status(404).json({ error: 'Attachment not found' });
      return;
    }

    await storage.delete(attachment.storageKey);
    await prisma.taskAttachment.delete({ where: { id: attachment.id } });

    res.status(204).send();
  } catch (error) {
    console.error('Delete attachment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
