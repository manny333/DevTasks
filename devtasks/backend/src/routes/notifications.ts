import { Router, Response, Request } from 'express';
import crypto from 'crypto';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { addClient, removeClient } from '../lib/sseManager';

const router = Router();

// ─── SSE one-time tickets ───────────────────────────────────
// EventSource cannot send an Authorization header, so the stream is
// authenticated with a short-lived, single-use ticket instead of putting the
// 7-day JWT in the query string (where it would end up in proxy logs).

const TICKET_TTL_MS = 60_000;
const tickets = new Map<string, { userId: string; expiresAt: number }>();

function issueTicket(userId: string): string {
  const now = Date.now();
  for (const [key, value] of tickets) {
    if (value.expiresAt < now) tickets.delete(key);
  }
  const ticket = crypto.randomBytes(32).toString('base64url');
  tickets.set(ticket, { userId, expiresAt: now + TICKET_TTL_MS });
  return ticket;
}

function consumeTicket(ticket: string | undefined): string | null {
  if (!ticket) return null;
  const entry = tickets.get(ticket);
  if (!entry) return null;
  tickets.delete(ticket);
  if (entry.expiresAt < Date.now()) return null;
  return entry.userId;
}

// GET /api/notifications/stream?ticket=<one-time-ticket>
router.get('/stream', (req: Request, res: Response): void => {
  const userId = consumeTicket(req.query.ticket as string | undefined);
  if (!userId) {
    res.status(401).json({ error: 'A valid ticket is required' });
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

// POST /api/notifications/stream-ticket — exchange a JWT for a one-time SSE ticket
router.post('/stream-ticket', (req: AuthRequest, res: Response): void => {
  res.json({ ticket: issueTicket(req.userId!) });
});

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
