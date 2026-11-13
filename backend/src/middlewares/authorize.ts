import { Request, Response, NextFunction } from "express";

type Role = "OWNER" | "DISPATCHER" | "TECHNICIAN";

export function authorize(...allowedRoles: Role[]) {
  return (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.auth) {
      res.status(401).json({
        success: false,
        message: "Authentication required",
      });
      return;
    }

    if (!allowedRoles.includes(req.auth.role)) {
      res.status(403).json({
        success: false,
        message: "You do not have permission",
      });
      return;
    }

    next();
  };
}
