import { Response } from 'express';
import { logger } from './logger';

export class SSEManager {
  // Map of orgId -> Set of Responses
  private clients = new Map<string, Set<Response>>();

  addClient(orgId: string, res: Response) {
    if (!this.clients.has(orgId)) {
      this.clients.set(orgId, new Set());
    }

    const orgClients = this.clients.get(orgId)!;
    orgClients.add(res);

    logger.info({ orgId, activeConnections: orgClients.size }, 'SSE client connected');

    // Keep connection alive with heartbeat
    const heartbeat = setInterval(() => {
      res.write(':\n\n'); // SSE comment to keep connection alive
    }, 30000);

    res.on('close', () => {
      clearInterval(heartbeat);
      orgClients.delete(res);
      if (orgClients.size === 0) {
        this.clients.delete(orgId);
      }
      logger.info({ orgId, activeConnections: orgClients.size }, 'SSE client disconnected');
    });
  }

  broadcast(orgId: string, type: string, data: any) {
    const orgClients = this.clients.get(orgId);
    if (!orgClients || orgClients.size === 0) return;

    const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;

    orgClients.forEach((client) => {
      client.write(payload);
    });

    logger.debug({ orgId, type, clientCount: orgClients.size }, 'SSE broadcast event');
  }
}

export const sseManager = new SSEManager();
