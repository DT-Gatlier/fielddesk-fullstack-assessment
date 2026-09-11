import type { WebSocket } from "@fastify/websocket";

export type RealtimeEventType =
  | "work_order.created"
  | "work_order.updated"
  | "work_order.assigned"
  | "work_order.status_changed"
  | "work_order.attachment_added";

export type RealtimeEvent = {
  type: RealtimeEventType;
  organisationId: string;
  payload: Record<string, unknown>;
  timestamp: string;
};

const rooms = new Map<string, Set<WebSocket>>();

export function subscribeToOrganisation(
  organisationId: string,
  socket: WebSocket,
): void {
  const room = rooms.get(organisationId) ?? new Set<WebSocket>();
  room.add(socket);
  rooms.set(organisationId, room);

  socket.on("close", () => {
    unsubscribeFromOrganisation(organisationId, socket);
  });
}

export function unsubscribeFromOrganisation(
  organisationId: string,
  socket: WebSocket,
): void {
  const room = rooms.get(organisationId);
  if (!room) {
    return;
  }
  room.delete(socket);
  if (room.size === 0) {
    rooms.delete(organisationId);
  }
}

export function publishToOrganisation(
  organisationId: string,
  event: Omit<RealtimeEvent, "timestamp"> & { timestamp?: string },
): void {
  const room = rooms.get(organisationId);
  if (!room || room.size === 0) {
    return;
  }

  const message = JSON.stringify({
    ...event,
    timestamp: event.timestamp ?? new Date().toISOString(),
  });

  for (const socket of room) {
    if (socket.readyState === socket.OPEN) {
      socket.send(message);
    }
  }
}

export function resetRealtimeRoomsForTests(): void {
  rooms.clear();
}

export function publishWorkOrderEvent(
  organisationId: string,
  type: RealtimeEventType,
  workOrder: Record<string, unknown>,
): void {
  publishToOrganisation(organisationId, {
    type,
    organisationId,
    payload: workOrder,
  });
}
