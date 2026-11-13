import { Response } from "express";

class RealtimeService {
  private connections: Map<string, Set<Response>> = new Map();

  subscribe(organisationId: string, res: Response) {
    if (!this.connections.has(organisationId)) {
      this.connections.set(organisationId, new Set());
    }
    this.connections.get(organisationId)!.add(res);

    res.write(`event: connected\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`);
  }

  unsubscribe(organisationId: string, res: Response) {
    const clients = this.connections.get(organisationId);
    if (!clients) return;

    clients.delete(res);
    if (clients.size === 0) {
      this.connections.delete(organisationId);
    }
  }

  broadcast(organisationId: string, event: string, payload: any) {
    const clients = this.connections.get(organisationId);
    if (!clients || clients.size === 0) return;

    const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of clients) {
      try {
        client.write(data);
      } catch {
        clients.delete(client);
      }
    }
  }
}

export const realtimeService = new RealtimeService();

