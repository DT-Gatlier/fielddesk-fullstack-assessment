import { Request, Response } from 'express';
import { logger } from '../infrastructure/logger.js';

class SSEManager {
  private subscribersByOrg = new Map<string, Set<Response>>();
  private pingInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startHeartbeat();
  }

  private startHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    // 25-second comment ping as per specification
    this.pingInterval = setInterval(() => {
      this.sendPingToAll();
    }, 25000);

    // Prevent interval from keeping the process alive
    if (this.pingInterval.unref) {
      this.pingInterval.unref();
    }
  }

  addClient(organisationId: string, req: Request, res: Response, orgName?: string): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }

    // Send initial connection event
    const welcome = JSON.stringify({
      message: `Connected to ${orgName || organisationId} real-time event stream`,
      organisationId,
      timestamp: new Date().toISOString(),
    });
    res.write(`event: connected\ndata: ${welcome}\n\n`);

    if (!this.subscribersByOrg.has(organisationId)) {
      this.subscribersByOrg.set(organisationId, new Set());
    }

    const orgClients = this.subscribersByOrg.get(organisationId)!;
    orgClients.add(res);

    logger.info(
      { organisationId, clientCount: orgClients.size },
      'SSE client connected to organisation stream'
    );

    const cleanup = () => {
      orgClients.delete(res);
      if (orgClients.size === 0) {
        this.subscribersByOrg.delete(organisationId);
      }
      logger.info(
        { organisationId, remainingClients: orgClients.size },
        'SSE client disconnected from organisation stream'
      );
    };

    req.on('close', cleanup);
    req.on('end', cleanup);
    res.on('error', cleanup);
  }

  broadcastToOrg(organisationId: string, eventName: string, data: any): void {
    const clients = this.subscribersByOrg.get(organisationId);
    if (!clients || clients.size === 0) {
      return;
    }

    const payload = typeof data === 'string' ? data : JSON.stringify(data);
    const chunk = `event: ${eventName}\ndata: ${payload}\n\n`;

    const deadSockets: Response[] = [];

    for (const client of clients) {
      try {
        client.write(chunk);
      } catch (err: any) {
        logger.warn({ err: err.message, organisationId }, 'Failed to write to SSE client, dropping socket');
        deadSockets.push(client);
      }
    }

    for (const dead of deadSockets) {
      clients.delete(dead);
    }

    if (clients.size === 0) {
      this.subscribersByOrg.delete(organisationId);
    }
  }

  sendPingToAll(): void {
    for (const [orgId, clients] of this.subscribersByOrg.entries()) {
      const deadSockets: Response[] = [];
      for (const client of clients) {
        try {
          client.write(': ping\n\n');
        } catch {
          deadSockets.push(client);
        }
      }
      for (const dead of deadSockets) {
        clients.delete(dead);
      }
      if (clients.size === 0) {
        this.subscribersByOrg.delete(orgId);
      }
    }
  }

  getClientCount(organisationId?: string): number {
    if (organisationId) {
      return this.subscribersByOrg.get(organisationId)?.size || 0;
    }
    let total = 0;
    for (const clients of this.subscribersByOrg.values()) {
      total += clients.size;
    }
    return total;
  }

  clear(): void {
    for (const clients of this.subscribersByOrg.values()) {
      for (const client of clients) {
        try {
          client.end();
        } catch {}
      }
    }
    this.subscribersByOrg.clear();
  }

  destroy(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    this.clear();
  }
}

export const sseManager = new SSEManager();

