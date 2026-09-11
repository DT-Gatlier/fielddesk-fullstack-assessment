import websocket from "@fastify/websocket";
import type { FastifyInstance } from "fastify";
import type { Env } from "../config.js";
import { authenticate } from "../middleware/auth.js";
import { subscribeToOrganisation } from "../services/realtime.service.js";

export async function registerRealtimeRoutes(
  app: FastifyInstance,
  _config: Env,
): Promise<void> {
  await app.register(websocket);

  app.get(
    "/api/v1/realtime",
    { websocket: true, preHandler: [authenticate] },
    (socket, request) => {
      subscribeToOrganisation(request.auth.organisationId, socket);

      socket.send(
        JSON.stringify({
          type: "connection.ready",
          organisationId: request.auth.organisationId,
          timestamp: new Date().toISOString(),
        }),
      );
    },
  );
}
