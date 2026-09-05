import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { log } from '../lib/logger';
import { AuthenticatedRequest, authenticateToken } from '../middleware/auth';

const router = Router();

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many registration attempts. Please try again later.' },
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please try again later.' },
});

const registerSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address').max(254),
  password: z.string().min(12, 'Password must be at least 12 characters').max(256),
  name: z.string().trim().min(1).max(80).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address').max(254),
  password: z.string().min(1, 'Password is required').max(256),
});

const cookieOptions = {
  httpOnly: true,
  secure: env.isProduction,
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

router.post('/register', registerLimiter, async (req, res) => {
  try {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      const formatted = parseResult.error.errors.map((error) => error.message).join(', ');
      return res.status(400).json({ error: formatted });
    }

    const { email, password, name } = parseResult.data;
    const normalizedEmail = email.toLowerCase();

    const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      return res.status(400).json({ error: 'Registration failed. Please check your details or sign in.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        passwordHash,
        name: name || normalizedEmail.split('@')[0],
      },
      select: { id: true, email: true, name: true, createdAt: true },
    });

    const token = jwt.sign({ id: user.id, email: user.email }, env.JWT_SECRET, {
      expiresIn: '7d',
    });

    res.cookie('token', token, cookieOptions);
    return res.status(201).json({ user });
  } catch (error) {
    log('error', 'auth.register_failed', { requestId: (req as AuthenticatedRequest).requestId, error: error instanceof Error ? error.message : 'Unknown error' });
    return res.status(400).json({ error: 'Registration failed. Please check your information.' });
  }
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      const formatted = parseResult.error.errors.map((validationError) => validationError.message).join(', ');
      return res.status(400).json({ error: formatted });
    }

    const { email, password } = parseResult.data;
    const normalizedEmail = email.toLowerCase();

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or credentials' });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(400).json({ error: 'Invalid email or credentials' });
    }

    const token = jwt.sign({ id: user.id, email: user.email }, env.JWT_SECRET, {
      expiresIn: '7d',
    });

    res.cookie('token', token, cookieOptions);
    return res.json({
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (error) {
    log('error', 'auth.login_failed', { requestId: (req as AuthenticatedRequest).requestId, error: error instanceof Error ? error.message : 'Unknown error' });
    return res.status(400).json({ error: 'Login failed. Please check your credentials.' });
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: env.isProduction,
    sameSite: 'lax',
  });
  return res.json({ message: 'Logged out successfully' });
});

router.get('/me', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user?.id },
      select: { id: true, email: true, name: true, createdAt: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    return res.json(user);
  } catch (error) {
    log('error', 'auth.me_failed', { requestId: req.requestId, userId: req.user?.id, error: error instanceof Error ? error.message : 'Unknown error' });
    return res.status(500).json({ error: 'Failed to retrieve profile' });
  }
});

export default router;
