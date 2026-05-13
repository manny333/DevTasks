import { Router, Response } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// POST /api/auth/google — verify Google ID token, create/find user, return app JWT
router.post('/google', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { credential } = req.body;
    if (!credential) {
      res.status(400).json({ error: 'Missing credential' });
      return;
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.email || !payload.sub) {
      res.status(400).json({ error: 'Invalid Google token' });
      return;
    }

    // Find or create user
    let user = await prisma.user.findUnique({ where: { googleId: payload.sub } });
    if (!user) {
      user = await prisma.user.create({
        data: {
          googleId: payload.sub,
          email: payload.email,
          name: payload.name || payload.email.split('@')[0],
          avatar: payload.picture || null,
        },
      });
    }

    const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET!, { expiresIn: '7d' });

    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar },
    });
  } catch (error) {
    console.error('Google auth error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
});

// GET /api/auth/me — return current user
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, name: true, email: true, avatar: true, createdAt: true },
    });
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json(user);
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
