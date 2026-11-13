export const ROUTE_CONFIG = {
  login: {
    id: "login",
    path: "/login",
  },
  protectedScreens: {
    id: "protected-screens",
    path: "/",
  },
  dashboard: {
    id: "dashboard",
    path: "/dashboard",
  },
  workOrders: {
    id: "work-orders",
    path: "/work-orders",
  },
  workOrderDetail: {
    id: "work-order-detail",
    path: "/work-orders/:id",
  },
  team: {
    id: "team",
    path: "/team",
  },
  settings: {
    id: "settings",
    path: "/settings",
  },
  notAuthorized: {
    id: "not-authorized",
    path: "/not-authorized",
  },
  notFound: {
    id: "not-found",
    path: "*",
  },
} as const

