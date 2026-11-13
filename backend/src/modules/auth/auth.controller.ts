import { Request, Response, NextFunction } from "express";
import { AuthService } from "./auth.service";
import { loginSchema } from "./auth.validation";
import { prisma } from "../../config/prisma";

const authService = new AuthService();

export class AuthController {
  async login(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const input = loginSchema.parse(req.body);

      const result = await authService.login(input);

      res.cookie("fielddesk_session", result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 24 * 60 * 60 * 1000,
        path: "/",
      });

      res.status(200).json({
        success: true,
        message: "Login successful",
        user: result.user,
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(
    _req: Request,
    res: Response
  ) {
    res.clearCookie("fielddesk_session", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });

    res.status(200).json({
      success: true,
      message: "Logout successful",
    });
  }

  async me(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      if (!req.auth) {
        res.status(401).json({
          success: false,
          message: "Authentication required",
        });
        return;
      }

      const user = await authService.getCurrentUser(req.auth.userId);

      res.status(200).json({
        success: true,
        user: user || req.auth,
      });
    } catch (error) {
      next(error);
    }
  }

  async getOrganisations(
    _req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const orgs = await prisma.organisation.findMany({
        select: {
          id: true,
          name: true,
          slug: true,
        },
        orderBy: { name: "asc" },
      });
      res.status(200).json({ success: true, organisations: orgs });
    } catch (error) {
      next(error);
    }
  }
}
