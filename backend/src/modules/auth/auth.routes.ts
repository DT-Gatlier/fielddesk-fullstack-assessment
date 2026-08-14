import { Router } from "express";
import { loginController } from "./auth.controller";
import { authenticate } from "../../middleware/authenticate";
import rateLimit from "express-rate-limit";

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

router.post("/login", loginLimiter, loginController);

router.get("/me", authenticate, (req, res) => {
  return res.status(200).json({
    user: req.user,
  });
});

router.post("/logout", authenticate, (_req, res) => {
  return res.status(204).send();
});

export default router;