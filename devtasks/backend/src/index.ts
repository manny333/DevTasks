import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import express from 'express';
import type { ErrorRequestHandler } from 'express';
import cors from 'cors';

import authRoutes from './routes/auth';
import projectRoutes from './routes/projects';
import sectionRoutes from './routes/sections';
import taskRoutes from './routes/tasks';
import sectionTaskRoutes from './routes/sectionTasks';
import commentRoutes from './routes/comments';
import tagRoutes from './routes/tags';
import templateRoutes from './routes/templates';
import searchRoutes from './routes/search';
import attachmentRoutes from './routes/attachments';
import notificationRoutes from './routes/notifications';
import calendarRoutes from './routes/calendar';
import aiRoutes from './routes/ai';
import userSettingsRoutes from './routes/userSettings';
import exportRoutes from './routes/export';
import { verifyUploadSignature, resolveUploadPath } from './lib/storage';
import prisma from './lib/prisma';

const app = express();
const PORT = process.env.PORT || 5001;
const ALLOWED_ORIGINS = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://localhost:5174')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

// Behind Cloudflare/nginx the client IP lives in X-Forwarded-For.
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy) {
  app.set('trust proxy', /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy);
}

app.use(cors({ origin: ALLOWED_ORIGINS, credentials: true }));
app.use(express.json({ limit: '1mb' }));

// Minimal structured request log (API only).
app.use((req, res, next) => {
  if (!req.path.startsWith('/api')) return next();
  const startedAt = Date.now();
  res.on('finish', () => {
    console.log(JSON.stringify({
      level: 'info',
      msg: 'request',
      method: req.method,
      path: req.originalUrl.split('?')[0],
      status: res.statusCode,
      ms: Date.now() - startedAt,
    }));
  });
  next();
});

// Serve uploaded files through signed, expiring URLs. There is no public
// static folder: knowing (or guessing) the storage key is not enough.
app.get('/uploads/:key', (req, res) => {
  const key = req.params.key as string;
  const exp = Number(req.query.exp);
  const sig = String(req.query.sig ?? '');

  if (!verifyUploadSignature(key, exp, sig)) {
    res.status(403).json({ error: 'Invalid or expired file link' });
    return;
  }

  const filePath = resolveUploadPath(key);
  if (!filePath || !fs.existsSync(filePath)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `attachment; filename="${key}"`);
  res.setHeader('Cache-Control', 'private, max-age=3600');
  res.sendFile(filePath);
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/projects', sectionRoutes);   // /api/projects/:projectId/sections
app.use('/api/sections', sectionRoutes);   // /api/sections/:id (PATCH, DELETE)
app.use('/api/tasks', taskRoutes);        // /api/tasks/:id, PATCH move/archive, tags
app.use('/api/sections', sectionTaskRoutes); // /api/sections/:sectionId/tasks
app.use('/api/tasks', commentRoutes);     // /api/tasks/:taskId/comments
app.use('/api/tasks', attachmentRoutes); // /api/tasks/:id/attachments
app.use('/api/projects', tagRoutes);      // /api/projects/:projectId/tags
app.use('/api/tags', tagRoutes);          // /api/tags/:id (PATCH, DELETE)
app.use('/api/projects', templateRoutes); // /api/projects/:projectId/templates
app.use('/api/templates', templateRoutes); // /api/templates/:id (PATCH, DELETE)
app.use('/api/search', searchRoutes);     // /api/search?q=query
app.use('/api/notifications', notificationRoutes); // /api/notifications
app.use('/api/projects', calendarRoutes);  // /api/projects/:projectId/calendar
app.use('/api/ai', aiRoutes);           // /api/ai/*
app.use('/api/user', userSettingsRoutes); // /api/user/ai-keys
app.use('/api/projects', exportRoutes);  // /api/projects/:projectId/export

// Health check
app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', database: 'up', timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[health] database check failed:', error);
    res.status(503).json({ status: 'degraded', database: 'down', timestamp: new Date().toISOString() });
  }
});

// Unknown API routes always answer JSON instead of falling through to the SPA
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Serve frontend static build (production)
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, '../../frontend/dist');
if (fs.existsSync(STATIC_DIR)) {
  app.use(express.static(STATIC_DIR));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      return res.sendFile(path.join(STATIC_DIR, 'index.html'));
    }
    next();
  });
} else {
  console.log(`[static] Frontend build not found at ${STATIC_DIR} — serving API only`);
}

// Global error handler: never leak stack traces or raw driver messages.
const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error('[error]', err);
  if (res.headersSent) return;

  const status = (err as { status?: number; statusCode?: number })?.status
    ?? (err as { statusCode?: number })?.statusCode;
  const type = (err as { type?: string })?.type;

  if (status === 413 || type === 'entity.too.large') {
    res.status(413).json({ error: 'Payload too large' });
    return;
  }
  if (status === 400 || type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }
  res.status(500).json({ error: 'Internal server error' });
};
app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`🚀 DevTasks API running on http://localhost:${PORT}`);
});

// Graceful shutdown: stop accepting requests, drain, disconnect Prisma.
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] ${signal} received — closing server`);

  const forceExit = setTimeout(() => {
    console.error('[shutdown] forced exit after 10s');
    process.exit(1);
  }, 10_000);
  forceExit.unref();

  server.close(() => {
    void prisma.$disconnect()
      .catch((error) => console.error('[shutdown] prisma disconnect failed:', error))
      .finally(() => {
        clearTimeout(forceExit);
        process.exit(0);
      });
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
