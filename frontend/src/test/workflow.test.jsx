import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { AuthProvider } from "../auth.jsx";
import { AppRoutes } from "../App.jsx";

// A tiny fake backend behind fetch, so the test exercises real UI behaviour end to end.
let orders;
const reply = (data, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } }));

function fakeApi(url, opts = {}) {
  const method = (opts.method || "GET").toUpperCase();
  const path = new URL(url, "http://test").pathname;
  const body = opts.body ? JSON.parse(opts.body) : null;
  if (path === "/api/auth/refresh/") return reply({ error: { message: "no session" } }, 401);
  if (path === "/api/auth/login/")
    return body.password === "Passw0rd!demo"
      ? reply({ access_token: "tok", username: "dispatcher_acme", role: "dispatcher" })
      : reply({ error: { code: "authentication_failed", message: "Invalid credentials" } }, 401);
  if (path === "/api/dashboard/") return reply({ by_status: { open: orders.length }, total: orders.length });
  if (path === "/api/stream-ticket/") return reply({ ticket: "t" });
  if (path === "/api/work-orders/" && method === "POST") {
    const o = { id: 1, reference: "WO-AB12CD", status: "open", technician: null, start_at: null, end_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...body };
    orders.push(o);
    return reply(o, 201);
  }
  if (path === "/api/work-orders/") return reply({ count: orders.length, results: orders });
  if (path === "/api/work-orders/1/") return reply(orders[0]);
  if (path.endsWith("/activity/") || path.endsWith("/attachments/") || path === "/api/technicians/") return reply([]);
  return reply({ error: { message: `unexpected ${method} ${path}` } }, 404);
}

beforeEach(() => {
  orders = [];
  vi.stubGlobal("fetch", vi.fn(fakeApi));
  vi.stubGlobal("EventSource", class { close() {} });
});
afterEach(() => vi.unstubAllGlobals());

const renderApp = () =>
  render(
    <MemoryRouter initialEntries={["/login"]}>
      <AuthProvider><AppRoutes /></AuthProvider>
    </MemoryRouter>
  );

test("dispatcher signs in and creates a work order", async () => {
  const user = userEvent.setup();
  renderApp();

  await user.type(await screen.findByLabelText(/username or email/i), "dispatcher@acme.test");
  await user.type(screen.getByLabelText(/password/i), "Passw0rd!demo");
  await user.click(screen.getByRole("button", { name: /sign in/i }));

  expect(await screen.findByRole("heading", { name: /dashboard/i })).toBeInTheDocument();

  await user.click(screen.getByRole("link", { name: /new work order/i }));
  await user.type(await screen.findByLabelText(/^title/i), "Replace pump");
  await user.type(screen.getByLabelText(/site name/i), "Plant 4");
  await user.click(screen.getByRole("button", { name: /create work order/i }));

  expect(await screen.findByRole("heading", { name: "Replace pump" })).toBeInTheDocument();
  expect(screen.getByText("WO-AB12CD")).toBeInTheDocument();
});

test("wrong password shows an error and stays on the login screen", async () => {
  const user = userEvent.setup();
  renderApp();
  await user.type(await screen.findByLabelText(/username or email/i), "dispatcher@acme.test");
  await user.type(screen.getByLabelText(/password/i), "nope");
  await user.click(screen.getByRole("button", { name: /sign in/i }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/incorrect/i);
});
