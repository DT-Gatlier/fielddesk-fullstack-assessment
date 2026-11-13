import { describe, expect, it } from "vitest";
import { makeStore, setCurrentUser, setAdminUsers, upsertAdminUser } from "../../frontend/src/lib/store";

describe("Redux client state", () => {
  it("keeps the authenticated session and tenant admin directory in one store", () => {
    const store = makeStore();
    store.dispatch(setCurrentUser({ id: "u-1", email: "owner@example.test", name: "Owner", role: "OWNER", organisationId: "org-a" }));
    store.dispatch(setAdminUsers([]));
    store.dispatch(upsertAdminUser({ id: "u-2", email: "tech@example.test", name: "Technician", role: "TECHNICIAN", isActive: true, createdAt: new Date().toISOString() }));
    expect(store.getState().session.user?.organisationId).toBe("org-a");
    expect(store.getState().admin.users.map((user) => user.id)).toEqual(["u-2"]);
  });
});
