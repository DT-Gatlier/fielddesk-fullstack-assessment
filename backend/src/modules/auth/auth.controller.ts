import type { Request, Response } from "express";
import { login, AuthenticationError } from "./auth.service";
import { loginSchema } from "./auth.schema";

export const loginController = async (
  req: Request,
  res: Response,
) => {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid login request",
          details: parsed.error.flatten(),
        },
      });
    }

    const result = await login(
      parsed.data.email,
      parsed.data.password,
    );

    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return res.status(401).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password",
        },
      });
    }

    console.error("Login error:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "An unexpected error occurred",
      },
    });
  }
};