import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { sseManager } from '../utils/sseManager';
import { logger } from '../utils/logger';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

/**
 * SSE uses GET requests and does not allow custom headers like Authorization.
 * Therefore, the token must be passed in the query string `?token=...`
 */
router.get('/events', (req: Request, res: Response) => {
  const token = req.query.token as string;
  
  if (!token) {
    res.status(401).send('Missing token');
    return;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; orgId: string; role: string };
    
    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // Flush headers to establish connection immediately
    res.flushHeaders();

    // Register connection with SSE Manager
    sseManager.addClient(decoded.orgId, res);
    
    // Send initial connected event
    res.write('event: connected\ndata: {"status": "ok"}\n\n');
  } catch (err) {
    logger.warn({ err }, 'SSE connection rejected due to invalid token');
    res.status(401).send('Invalid token');
  }
});

export default router;
