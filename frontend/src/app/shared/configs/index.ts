/**
 * Defines the roles available for users in FieldDesk.
 */
export const USER_ROLES = {
  OWNER: "owner",
  DISPATCHER: "dispatcher",
  TECHNICIAN: "technician",
} as const

export const APP_USER_ROLES = {
  OWNER: "owner",
  DISPATCHER: "dispatcher",
  TECHNICIAN: "technician",
} as const

export type AppUserRole = (typeof APP_USER_ROLES)[keyof typeof APP_USER_ROLES]

