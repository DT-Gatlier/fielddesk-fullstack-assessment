import { Router } from "express";
import { loginController } from "./auth.controller";
import { authenticate } from "../../middleware/authenticate";

const router = Router();

/**
 * POST /api/auth/login
 *
 * Public endpoint.
 */
router.post("/login", loginController);

/**
 * GET /api/auth/me
 *
 * Returns the currently authenticated user.
 */
router.get("/me", authenticate, (req, res) => {
  return res.status(200).json({
    user: req.user,
  });
});

/**
 * POST /api/auth/logout
 *
 * JWT logout is handled client-side by removing the access token.
 *
 * The endpoint still exists so the frontend has a consistent
 * authentication API.
 */
router.post("/logout", authenticate, (_req, res) => {
  return res.status(204).send();
});

export default router;