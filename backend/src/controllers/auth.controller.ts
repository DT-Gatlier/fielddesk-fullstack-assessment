import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { UnauthorizedError } from '../utils/errors';
import { logger } from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '30d';

export const login = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { org: true },
    });

    if (!user || !user.isActive) {
      logger.warn({ email, reqId: req.correlationId }, 'Login failed: user not found or inactive');
      throw new UnauthorizedError('Invalid credentials');
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      logger.warn({ email, reqId: req.correlationId }, 'Login failed: incorrect password');
      throw new UnauthorizedError('Invalid credentials');
    }

    const token = jwt.sign(
      {
        id: user.id,
        orgId: user.orgId,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    const refreshToken = jwt.sign(
      { id: user.id },
      JWT_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRY }
    );

    logger.info({ userId: user.id, reqId: req.correlationId }, 'User logged in successfully');

    res.json({
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        orgId: user.orgId,
        orgName: user.org.name,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const me = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { org: true },
    });

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        orgId: user.orgId,
        orgName: user.org.name,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const refresh = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      throw new UnauthorizedError('Refresh token required');
    }

    try {
      const decoded = jwt.verify(refreshToken, JWT_SECRET) as { id: string };
      
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        include: { org: true },
      });

      if (!user || !user.isActive) {
        throw new UnauthorizedError('User not found or inactive');
      }

      const newToken = jwt.sign(
        {
          id: user.id,
          orgId: user.orgId,
          role: user.role,
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
      );

      const newRefreshToken = jwt.sign(
        { id: user.id },
        JWT_SECRET,
        { expiresIn: JWT_REFRESH_EXPIRY }
      );

      res.json({
        token: newToken,
        refreshToken: newRefreshToken,
      });
    } catch (err) {
      throw new UnauthorizedError('Invalid or expired refresh token');
    }
  } catch (error) {
    next(error);
  }
};
