import { Router, Response, Request } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { addClient, removeClient } from '../lib/sseManager';

const router = Router();

// ─── SSE stream (auth via ?token= query param) ──────────────

// GET /api/notifications/stream?token=<jwt>
router.get('/stream', (req: Request, res: Response): void => {
  const token = req.query.token as string | undefined;
  if (!token) {
    res.status(401).json({ error: 'Token required' });
    return;
  }

  let userId: string;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
    userId = payload.userId;
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // disable Nginx buffering
  res.flushHeaders();

  // Send a comment ping so the browser knows the connection is alive
  res.write(': connected\n\n');

  addClient(userId, res);

  // Keep-alive ping every 25 s to prevent proxy timeouts
  const keepAlive = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(keepAlive);
    }
  }, 25_000);

  req.on('close', () => {
    clearInterval(keepAlive);
    removeClient(userId, res);
  });
});

router.use(authMiddleware);

// GET /api/notifications — list notifications for current user
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.userId! },
      orderBy: [{ read: 'asc' }, { createdAt: 'desc' }],
      take: 50,
    });
    const unreadCount = await prisma.notification.count({
      where: { userId: req.userId!, read: false },
    });
    res.json({ notifications, unreadCount });
  } catch (error) {
    console.error('List notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/notifications/read-all — mark all as read
router.patch('/read-all', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.userId!, read: false },
      data: { read: true },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Read-all notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/notifications/:id/read — mark single notification as read
router.patch('/:id/read', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const notification = await prisma.notification.findUnique({
      where: { id: req.params.id as string },
    });
    if (!notification) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }
    if (notification.userId !== req.userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const updated = await prisma.notification.update({
      where: { id: req.params.id as string },
      data: { read: true },
    });
    res.json(updated);
  } catch (error) {
    console.error('Read notification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/notifications/:id — dismiss a notification
router.delete('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const notification = await prisma.notification.findUnique({
      where: { id: req.params.id as string },
    });
    if (!notification) {
      res.status(404).json({ error: 'Notification not found' });
      return;
    }
    if (notification.userId !== req.userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    await prisma.notification.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
