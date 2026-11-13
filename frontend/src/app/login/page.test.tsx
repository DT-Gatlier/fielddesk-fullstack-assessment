import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/toast";
import LoginPage from "./page";

const routerMocks = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => routerMocks }));

describe("login workflow", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    routerMocks.push.mockReset();
    routerMocks.replace.mockReset();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string, options?: RequestInit) => {
      if (String(url).includes("organisations")) return new Response(JSON.stringify({ success: true, organisations: [{ id: "org-apex-001", name: "Apex Facility Services", slug: "apex-facility" }] }), { status: 200, headers: { "Content-Type": "application/json" } });
      if (String(url).includes("/api/auth/login")) return new Response(JSON.stringify({ success: true, message: "Login successful", user: { id: "usr-apex-owner", role: "OWNER" } }), { status: 200, headers: { "Content-Type": "application/json" } });
      throw new Error(`Unexpected request: ${String(url)} ${options?.method || "GET"}`);
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  it("loads organisations, submits credentials, and redirects after successful login", async () => {
    const user = userEvent.setup();
    render(<ToastProvider><LoginPage /></ToastProvider>);

    const organisation = await screen.findByRole("option", { name: "Apex Facility Services" });
    await user.selectOptions(organisation.closest("select")!, "org-apex-001");
    await user.type(screen.getByPlaceholderText("operator@company.com"), "owner@apex.com");
    await user.type(screen.getByPlaceholderText("Enter password"), "password123");
    fireEvent.submit(screen.getByPlaceholderText("Enter password").closest("form")!);

    await waitFor(() => expect(routerMocks.push).toHaveBeenCalledWith("/dashboard"), { timeout: 2_000 });
    const loginCall = fetchMock.mock.calls.find(([url]) => String(url).includes("/api/auth/login"));
    expect(JSON.parse(loginCall?.[1]?.body as string)).toEqual({ email: "owner@apex.com", password: "password123", organisationId: "org-apex-001" });
  });
});
