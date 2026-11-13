import { Router } from "express";
import { AuthController } from "./auth.controller";
import { authenticate } from "../../middlewares/authenticate";
import rateLimit from "express-rate-limit";

const router = Router();
const authController = new AuthController();

router.post("/login", rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false }), authController.login.bind(authController));
router.post("/logout", authController.logout.bind(authController));
router.get("/me", authenticate, authController.me.bind(authController));
router.get("/organisations", authController.getOrganisations.bind(authController));

export default router;
