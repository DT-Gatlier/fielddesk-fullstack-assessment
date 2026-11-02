export const STATUSES = ["open", "in_progress", "on_hold", "completed", "cancelled"];
export const PRIORITIES = ["low", "medium", "high", "urgent"];
// Technicians may only follow these transitions (backend enforces the same rules)
export const TRANSITIONS = {
  open: ["in_progress"],
  in_progress: ["completed", "on_hold"],
  on_hold: ["in_progress"],
  completed: [],
  cancelled: [],
};
export const PAGE_SIZE = 20;
export const MAX_UPLOAD = 5 * 1024 * 1024;
export const ALLOWED_TYPES = ["image/png", "image/jpeg", "application/pdf"];

export const label = (s) => String(s ?? "").replace(/_/g, " ");
export const fmt = (iso) => (iso ? new Date(iso).toLocaleString() : "—");
// UI convenience only: the backend is the real authority for roles
// Only dispatchers create/edit/assign/update work orders; owners manage users and may view + export
export const canDispatch = (u) => !!u && u.role === "dispatcher";
export const canManage = (u) => !!u && ["owner", "dispatcher"].includes(u.role);
