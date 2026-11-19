import crypto from 'node:crypto';
import { Router, Response } from 'express';
import multer from 'multer';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { canManageAccess, getProjectAccess, requireProjectAccess } from '../lib/access';
import { DocumentCategory, DocumentSource } from '../generated/prisma/enums';
import type { Prisma } from '../generated/prisma/client';

const router = Router();
router.use(authMiddleware);

const MAX_CONTENT_BYTES = 1024 * 1024;
const MAX_IMPORT_FILES = 20;
const MAX_PINNED = 5;
const MAX_TITLE = 200;
const MAX_CHANGE_NOTE = 500;
const CONTEXT_MAX_CHARS = 20_000;

const CATEGORIES = Object.values(DocumentCategory) as DocumentCategory[];
const AUTHOR_SELECT = { id: true, name: true, email: true, avatar: true } as const;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CONTENT_BYTES, files: MAX_IMPORT_FILES },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    if (name.endsWith('.md') || name.endsWith('.markdown')) cb(null, true);
    else cb(new Error('Only .md and .markdown files are allowed'));
  },
});

function isCategory(value: unknown): value is DocumentCategory {
  return typeof value === 'string' && CATEGORIES.includes(value as DocumentCategory);
}

function cleanTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const title = value.trim();
  return title.length > 0 && title.length <= MAX_TITLE ? title : null;
}

function cleanContent(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const content = value.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  if (content.trim().length === 0) return null;
  if (content.includes('\0')) return null;
  if (Buffer.byteLength(content, 'utf8') > MAX_CONTENT_BYTES) return null;
  return content;
}

function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80) || 'document';
}

async function uniqueSlug(projectId: string, title: string, excludeId?: string): Promise<string> {
  const base = slugify(title);
  for (let suffix = 0; suffix < 100; suffix++) {
    const slug = suffix === 0 ? base : `${base}-${suffix + 1}`;
    const existing = await prisma.projectDocument.findFirst({
      where: { projectId, slug, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (!existing) return slug;
  }
  return `${base}-${crypto.randomBytes(3).toString('hex')}`;
}

function excerpt(content: string, size = 220): string {
  const plain = content
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > size ? `${plain.slice(0, size)}…` : plain;
}

function titleFromContent(content: string, filename: string): string {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, MAX_TITLE);
  const base = filename.replace(/\.(md|markdown)$/i, '').replace(/[-_]+/g, ' ').trim();
  return (base || 'Documento sin título').slice(0, MAX_TITLE);
}

function parseBool(value: unknown): boolean {
  return value === true || value === 'true' || value === '1';
}

function clampLimit(value: unknown, fallback = 50): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 1), 100);
}

async function ensurePinnedSlot(projectId: string, documentId?: string): Promise<boolean> {
  const pinned = await prisma.projectDocument.count({
    where: {
      projectId,
      isPinned: true,
      isArchived: false,
      ...(documentId ? { id: { not: documentId } } : {}),
    },
  });
  return pinned < MAX_PINNED;
}

function listSelect(): Prisma.ProjectDocumentSelect {
  return {
    id: true,
    title: true,
    slug: true,
    category: true,
    source: true,
    content: true,
    isPinned: true,
    isArchived: true,
    createdAt: true,
    updatedAt: true,
    createdBy: { select: AUTHOR_SELECT },
    updatedBy: { select: AUTHOR_SELECT },
  };
}

type ListDocument = Prisma.ProjectDocumentGetPayload<{ select: ReturnType<typeof listSelect> }>;

function toListItem(document: ListDocument) {
  const { content, createdBy, updatedBy, ...rest } = document;
  return {
    ...rest,
    author: createdBy,
    updatedBy,
    excerpt: excerpt(content),
    size: Buffer.byteLength(content, 'utf8'),
  };
}

async function findDocument(projectId: string, documentId: string) {
  return prisma.projectDocument.findFirst({
    where: { id: documentId, projectId },
    include: {
      createdBy: { select: AUTHOR_SELECT },
      updatedBy: { select: AUTHOR_SELECT },
    },
  });
}

function sendDocument(res: Response, document: NonNullable<Awaited<ReturnType<typeof findDocument>>>) {
  const { content, createdBy, updatedBy, ...rest } = document;
  res.json({
    ...rest,
    content,
    author: createdBy,
    updatedBy,
    size: Buffer.byteLength(content, 'utf8'),
  });
}

// GET /api/projects/:projectId/documents — list metadata, never full content
router.get('/:projectId/documents', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireProjectAccess(req, res, { minEdit: false })) return;

    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
    const category = typeof req.query.category === 'string' ? req.query.category : '';
    const where: Prisma.ProjectDocumentWhereInput = {
      projectId: req.params.projectId as string,
      ...(req.query.includeArchived === 'true' ? {} : { isArchived: false }),
      ...(isCategory(category) ? { category } : {}),
      ...(parseBool(req.query.pinned) ? { isPinned: true } : {}),
    };
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { content: { contains: q, mode: 'insensitive' } },
      ];
    }

    const documents = await prisma.projectDocument.findMany({
      where,
      select: listSelect(),
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }],
      take: clampLimit(req.query.limit),
    });
    res.json(documents.map(toListItem));
  } catch (error) {
    console.error('List project documents error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/projects/:projectId/documents/:documentId — full document
router.get('/:projectId/documents/:documentId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireProjectAccess(req, res, { minEdit: false })) return;
    const document = await findDocument(req.params.projectId as string, req.params.documentId as string);
    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    sendDocument(res, document);
  } catch (error) {
    console.error('Get project document error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/projects/:projectId/documents — create from the editor
router.post('/:projectId/documents', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireProjectAccess(req, res)) return;

    const title = cleanTitle(req.body?.title);
    const content = cleanContent(req.body?.content);
    const category = req.body?.category === undefined ? 'OTHER' : req.body.category;
    if (!title || !content) {
      res.status(400).json({ error: 'title and non-empty content are required (max 1 MB)' });
      return;
    }
    if (!isCategory(category)) {
      res.status(400).json({ error: `category must be one of: ${CATEGORIES.join(', ')}` });
      return;
    }
    const isPinned = parseBool(req.body?.isPinned);
    if (isPinned && !await ensurePinnedSlot(req.params.projectId as string)) {
      res.status(400).json({ error: `A project can have at most ${MAX_PINNED} pinned documents` });
      return;
    }

    const projectId = req.params.projectId as string;
    const document = await prisma.projectDocument.create({
      data: {
        projectId,
        title,
        slug: await uniqueSlug(projectId, title),
        category,
        content,
        contentHash: hashContent(content),
        source: DocumentSource.EDITOR,
        isPinned,
        createdById: req.userId!,
      },
      include: {
        createdBy: { select: AUTHOR_SELECT },
        updatedBy: { select: AUTHOR_SELECT },
      },
    });
    res.status(201).json({
      ...document,
      author: document.createdBy,
      size: Buffer.byteLength(document.content, 'utf8'),
    });
  } catch (error) {
    console.error('Create project document error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/projects/:projectId/documents/:documentId — edit and snapshot previous version
router.patch('/:projectId/documents/:documentId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireProjectAccess(req, res)) return;

    const projectId = req.params.projectId as string;
    const existing = await findDocument(projectId, req.params.documentId as string);
    if (!existing) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const has = (field: string) => Object.prototype.hasOwnProperty.call(req.body ?? {}, field);
    const title = has('title') ? cleanTitle(req.body.title) : existing.title;
    const content = has('content') ? cleanContent(req.body.content) : existing.content;
    const category = has('category') ? req.body.category : existing.category;
    const changeNote = typeof req.body?.changeNote === 'string'
      ? req.body.changeNote.trim().slice(0, MAX_CHANGE_NOTE) || null
      : null;

    if (title === null || content === null) {
      res.status(400).json({ error: 'title and non-empty content are required (max 1 MB)' });
      return;
    }
    if (!isCategory(category)) {
      res.status(400).json({ error: `category must be one of: ${CATEGORIES.join(', ')}` });
      return;
    }

    const isPinned = has('isPinned') ? parseBool(req.body.isPinned) : existing.isPinned;
    if (isPinned && !existing.isPinned && !await ensurePinnedSlot(projectId, existing.id)) {
      res.status(400).json({ error: `A project can have at most ${MAX_PINNED} pinned documents` });
      return;
    }
    if (!has('title') && !has('content') && !has('category') && !has('isPinned')) {
      res.status(400).json({ error: 'Provide at least one field to update' });
      return;
    }

    const contentChanged = content !== existing.content;
    const metadataChanged = title !== existing.title || category !== existing.category;
    if (!contentChanged && !metadataChanged && !has('isPinned')) {
      res.status(400).json({ error: 'No changes provided' });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (contentChanged || metadataChanged) {
        await tx.projectDocumentVersion.create({
          data: {
            documentId: existing.id,
            title: existing.title,
            category: existing.category,
            content: existing.content,
            changeNote,
            createdById: req.userId!,
          },
        });
      }
      return tx.projectDocument.update({
        where: { id: existing.id },
        data: {
          ...(has('title') ? { title } : {}),
          ...(has('content') ? { content, contentHash: hashContent(content) } : {}),
          ...(has('category') ? { category } : {}),
          ...(has('isPinned') ? { isPinned } : {}),
          updatedById: req.userId!,
        },
        include: {
          createdBy: { select: AUTHOR_SELECT },
          updatedBy: { select: AUTHOR_SELECT },
        },
      });
    });

    res.json({
      ...updated,
      author: updated.createdBy,
      size: Buffer.byteLength(updated.content, 'utf8'),
    });
  } catch (error) {
    console.error('Update project document error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/projects/:projectId/documents/:documentId/archive
router.post('/:projectId/documents/:documentId/archive', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const access = await getProjectAccess(req.userId!, req.params.projectId as string);
    if (!access) {
      res.status(403).json({ error: 'No access to this project' });
      return;
    }
    if (!canManageAccess(access)) {
      res.status(403).json({ error: 'Only FULL or OWNER project members can archive or restore documents' });
      return;
    }
    const projectId = req.params.projectId as string;
    const document = await findDocument(projectId, req.params.documentId as string);
    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    const archived = req.body?.archived === undefined ? !document.isArchived : parseBool(req.body.archived);
    const updated = await prisma.projectDocument.update({
      where: { id: document.id },
      data: { isArchived: archived, ...(archived ? { isPinned: false } : {}) },
    });
    res.json({ id: updated.id, isArchived: updated.isArchived, isPinned: updated.isPinned });
  } catch (error) {
    console.error('Archive project document error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/projects/:projectId/documents/:documentId/versions
router.get('/:projectId/documents/:documentId/versions', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireProjectAccess(req, res, { minEdit: false })) return;
    const projectId = req.params.projectId as string;
    const document = await findDocument(projectId, req.params.documentId as string);
    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    const versions = await prisma.projectDocumentVersion.findMany({
      where: { documentId: document.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json(versions.map((version) => ({
      ...version,
      size: Buffer.byteLength(version.content, 'utf8'),
    })));
  } catch (error) {
    console.error('List document versions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/projects/:projectId/documents/:documentId/versions/:versionId/restore
router.post(
  '/:projectId/documents/:documentId/versions/:versionId/restore',
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const access = await getProjectAccess(req.userId!, req.params.projectId as string);
      if (!access) {
        res.status(403).json({ error: 'No access to this project' });
        return;
      }
      if (!canManageAccess(access)) {
        res.status(403).json({ error: 'Only FULL or OWNER project members can archive or restore documents' });
        return;
      }
      const projectId = req.params.projectId as string;
      const document = await findDocument(projectId, req.params.documentId as string);
      if (!document) {
        res.status(404).json({ error: 'Document not found' });
        return;
      }
      const version = await prisma.projectDocumentVersion.findFirst({
        where: { id: req.params.versionId as string, documentId: document.id },
      });
      if (!version) {
        res.status(404).json({ error: 'Version not found' });
        return;
      }

      const updated = await prisma.$transaction(async (tx) => {
        await tx.projectDocumentVersion.create({
          data: {
            documentId: document.id,
            title: document.title,
            category: document.category,
            content: document.content,
            changeNote: `Restored version ${version.id}`,
            createdById: req.userId!,
          },
        });
        return tx.projectDocument.update({
          where: { id: document.id },
          data: {
            title: version.title,
            category: version.category,
            content: version.content,
            contentHash: hashContent(version.content),
            isArchived: false,
            updatedById: req.userId!,
          },
        });
      });
      res.json({
        ...updated,
        size: Buffer.byteLength(updated.content, 'utf8'),
      });
    } catch (error) {
      console.error('Restore document version error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// POST /api/projects/:projectId/documents/import — multipart Markdown import
router.post(
  '/:projectId/documents/import',
  (req, res, next) => {
    upload.array('files', MAX_IMPORT_FILES)(req, res, (error) => {
      if (!error) {
        next();
        return;
      }
      const message = error instanceof multer.MulterError
        ? `Upload failed: ${error.message}`
        : error instanceof Error ? error.message : 'Upload failed';
      res.status(400).json({ error: message });
    });
  },
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!await requireProjectAccess(req, res)) return;
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      if (files.length === 0) {
        res.status(400).json({ error: 'No files provided' });
        return;
      }

      const projectId = req.params.projectId as string;
      const category = req.body?.category === undefined ? 'OTHER' : req.body.category;
      if (!isCategory(category)) {
        res.status(400).json({ error: `category must be one of: ${CATEGORIES.join(', ')}` });
        return;
      }
      const isPinned = parseBool(req.body?.pinned);
      if (isPinned && !await ensurePinnedSlot(projectId)) {
        res.status(400).json({ error: `A project can have at most ${MAX_PINNED} pinned documents` });
        return;
      }

      const created: unknown[] = [];
      const skipped: { filename: string; documentId: string }[] = [];

      for (const file of files) {
        let content: string;
        try {
          content = new TextDecoder('utf-8', { fatal: true }).decode(file.buffer).replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
        } catch {
          skipped.push({ filename: file.originalname, documentId: 'invalid-utf8' });
          continue;
        }
        if (
          content.trim().length === 0 ||
          content.includes('\0') ||
          Buffer.byteLength(content, 'utf8') > MAX_CONTENT_BYTES
        ) {
          skipped.push({ filename: file.originalname, documentId: 'invalid-content' });
          continue;
        }

        const contentHash = hashContent(content);
        const duplicate = await prisma.projectDocument.findFirst({
          where: { projectId, contentHash },
          select: { id: true },
        });
        if (duplicate) {
          skipped.push({ filename: file.originalname, documentId: duplicate.id });
          continue;
        }

        const title = titleFromContent(content, file.originalname);
        const document = await prisma.projectDocument.create({
          data: {
            projectId,
            title,
            slug: await uniqueSlug(projectId, title),
            category,
            content,
            contentHash,
            source: DocumentSource.UPLOAD,
            isPinned,
            createdById: req.userId!,
          },
        });
        created.push({
          ...document,
          size: Buffer.byteLength(document.content, 'utf8'),
        });
      }

      res.status(created.length > 0 ? 201 : 200).json({
        created,
        skipped,
        imported: created.length,
      });
    } catch (error) {
      console.error('Import project documents error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
);

// GET /api/projects/:projectId/context — compact project context for agents
router.get('/:projectId/context', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!await requireProjectAccess(req, res, { minEdit: false })) return;
    const project = await prisma.project.findUnique({
      where: { id: req.params.projectId as string },
      select: { id: true, name: true, slug: true, description: true },
    });
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    const documents = await prisma.projectDocument.findMany({
      where: { projectId: project.id, isPinned: true, isArchived: false },
      select: { id: true, title: true, slug: true, category: true, content: true },
      orderBy: { updatedAt: 'desc' },
    });

    const parts = [
      `# ${project.name}`,
      '',
      project.description ?? '',
      '',
      ...documents.flatMap((document) => [
        `## ${document.title} (${document.category})`,
        '',
        document.content,
        '',
      ]),
    ];
    const full = parts.join('\n').trim();
    const content = full.length > CONTEXT_MAX_CHARS
      ? `${full.slice(0, CONTEXT_MAX_CHARS)}\n\n… (context truncated)`
      : full;

    res.json({
      project,
      documents,
      content,
      truncated: full.length > CONTEXT_MAX_CHARS,
    });
  } catch (error) {
    console.error('Get project context error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
