export type UserRole = "owner" | "dispatcher" | "technician";

export type AuthContext = {
  userId: string;
  organisationId: string;
  role: UserRole;
  email: string;
};

export type JwtPayload = {
  sub: string;
  org: string;
  role: UserRole;
  email: string;
};

export type UserRecord = {
  id: string;
  organisationId: string;
  email: string;
  role: UserRole;
  isActive: boolean;
};
