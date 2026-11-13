import { configureStore, createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { AuthUser } from "./api";

type AdminUser = { id: string; email: string; name: string; role: "OWNER" | "DISPATCHER" | "TECHNICIAN"; isActive: boolean; createdAt: string };
type AdminAuditEntry = { id: string; action: string; targetType: string; targetId: string; createdAt: string; actor?: { name: string; email: string } | null; before?: unknown; after?: unknown };
type Delivery = { id: string; jobId: string; workOrderId: string; technicianId: string; status: string; attempts: number; lastError: string | null; queuedAt: string; completedAt: string | null };
type Organisation = { id: string; name: string; slug: string; storageUsedBytes: string; storageLimitBytes: string };

const sessionSlice = createSlice({
  name: "session",
  initialState: { user: null as AuthUser | null },
  reducers: {
    setCurrentUser(state, action: PayloadAction<AuthUser | null>) { state.user = action.payload; },
    clearSession(state) { state.user = null; },
  },
});

const adminSlice = createSlice({
  name: "admin",
  initialState: { users: [] as AdminUser[], organisation: null as Organisation | null, audit: [] as AdminAuditEntry[], deliveries: [] as Delivery[] },
  reducers: {
    setAdminUsers(state, action: PayloadAction<AdminUser[]>) { state.users = action.payload; },
    upsertAdminUser(state, action: PayloadAction<AdminUser>) { const index = state.users.findIndex((user) => user.id === action.payload.id); if (index < 0) state.users.push(action.payload); else state.users[index] = action.payload; },
    setAdminOrganisation(state, action: PayloadAction<Organisation>) { state.organisation = action.payload; },
    setAuditEntries(state, action: PayloadAction<AdminAuditEntry[]>) { state.audit = action.payload; },
    setNotificationDeliveries(state, action: PayloadAction<Delivery[]>) { state.deliveries = action.payload; },
  },
});

export const { setCurrentUser, clearSession } = sessionSlice.actions;
export const { setAdminUsers, upsertAdminUser, setAdminOrganisation, setAuditEntries, setNotificationDeliveries } = adminSlice.actions;
export const makeStore = () => configureStore({ reducer: { session: sessionSlice.reducer, admin: adminSlice.reducer }, devTools: false });
export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
