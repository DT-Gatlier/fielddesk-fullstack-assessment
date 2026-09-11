import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { buildApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { closeNotificationQueue } from "../src/queues/notifications.queue.js";
import { resetRealtimeRoomsForTests } from "../src/services/realtime.service.js";
import { closePool } from "../src/db/pool.js";
import { cookiePair } from "./helpers.js";

const config = loadConfig();
const password = config.SEED_PASSWORD;

async function loginAs(app: Awaited<ReturnType<typeof buildApp>>, email: string) {
  const response = await app.inject({
    method: "POST",
    url: "/api/v1/auth/login",
    payload: { email, password },
  });
  expect(response.statusCode).toBe(200);
  return cookiePair(response);
}

function waitForMessage(socket: WebSocket, timeoutMs = 3000): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for WebSocket message"));
    }, timeoutMs);

    socket.once("message", (data) => {
      clearTimeout(timer);
      resolve(data.toString());
    });
  });
}

function connectReadySocket(url: string, cookie: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { headers: { Cookie: cookie } });
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for connection.ready"));
    }, 3000);

    socket.once("message", (data) => {
      clearTimeout(timer);
      const message = data.toString();
      if (!message.includes("connection.ready")) {
        reject(new Error(`Expected connection.ready, got: ${message}`));
        return;
      }
      resolve(socket);
    });
    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

describe("Real-time WebSocket updates", () => {
  const appPromise = buildApp(config);
  let wsUrl = "";

  beforeAll(async () => {
    const app = await appPromise;
    await app.ready();
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP server address");
    }
    wsUrl = `ws://127.0.0.1:${address.port}/api/v1/realtime`;
  });

  afterAll(async () => {
    const app = await appPromise;
    resetRealtimeRoomsForTests();
    await app.close();
    await closeNotificationQueue();
    await closePool();
  });

  it("does not deliver organisation events to clients in another organisation", async () => {
    const app = await appPromise;
    const acmeCookie = await loginAs(app, "dispatcher@acme.test");
    const betaCookie = await loginAs(app, "dispatcher@beta.test");

    const [acmeSocket, betaSocket] = await Promise.all([
      connectReadySocket(wsUrl, acmeCookie),
      connectReadySocket(wsUrl, betaCookie),
    ]);

    const create = await app.inject({
      method: "POST",
      url: "/api/v1/work-orders",
      headers: { cookie: acmeCookie },
      payload: {
        title: "Realtime isolation test",
        description: "",
        priority: "low",
        siteName: "Site",
      },
    });
    expect(create.statusCode).toBe(200);

    const acmeEvent = JSON.parse(await waitForMessage(acmeSocket));
    expect(acmeEvent.type).toBe("work_order.created");
    expect(acmeEvent.organisationId).toBe(create.json().workOrder.organisationId);

    await expect(waitForMessage(betaSocket, 500)).rejects.toThrow();

    acmeSocket.close();
    betaSocket.close();
  });
});
