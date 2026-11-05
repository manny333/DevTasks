import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { saveUserApiKey } from '../lib/userApiKeys';

const router = Router();
router.use(authMiddleware);

// GET /api/user/ai-keys — list user's saved API keys
router.get('/ai-keys', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const keys = await prisma.userApiKey.findMany({
      where: { userId: req.userId! },
      select: { id: true, provider: true, label: true, isActive: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(keys);
  } catch (error) {
    console.error('List API keys error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/user/ai-keys — save or update an API key
router.put('/ai-keys', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { provider, apiKey, label } = req.body;
    if (!provider || !apiKey) {
      res.status(400).json({ error: 'provider and apiKey are required' });
      return;
    }
    if (typeof provider !== 'string' || typeof apiKey !== 'string') {
      res.status(400).json({ error: 'provider and apiKey must be strings' });
      return;
    }

    const validProviders = ['deepseek', 'openai', 'anthropic', 'gemini'];
    if (!validProviders.includes(provider)) {
      res.status(400).json({ error: `Invalid provider. Supported: ${validProviders.join(', ')}` });
      return;
    }

    // Stored encrypted with AES-256-GCM; plaintext never touches the database.
    const key = await saveUserApiKey(req.userId!, provider, apiKey, label || null);

    res.json({
      id: key.id,
      provider: key.provider,
      label: key.label,
      isActive: key.isActive,
      createdAt: key.createdAt,
    });
  } catch (error) {
    console.error('Save API key error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/user/ai-keys/:provider — delete a saved API key
router.delete('/ai-keys/:provider', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await prisma.userApiKey.deleteMany({
      where: { userId: req.userId!, provider: req.params.provider as string },
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Delete API key error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
