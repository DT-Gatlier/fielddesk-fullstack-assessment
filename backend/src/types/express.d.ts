export interface AuthenticatedUser {
  userId: string;
  organisationId: string;
  role: "OWNER" | "DISPATCHER" | "TECHNICIAN";
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedUser;
    }
  }
}

export {};