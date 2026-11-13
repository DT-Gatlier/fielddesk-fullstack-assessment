import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { authenticate } from "../../middlewares/authenticate";
import { authorize } from "../../middlewares/authorize";
import { AdminService } from "./admin.service";

const router = Router();
const service = new AdminService();
const userCreate = z.object({ email: z.string().email(), name: z.string().min(2).max(120), password: z.string().min(8).max(128), role: z.enum(["OWNER", "DISPATCHER", "TECHNICIAN"]) });
const userUpdate = z.object({ name: z.string().min(2).max(120).optional(), role: z.enum(["OWNER", "DISPATCHER", "TECHNICIAN"]).optional(), isActive: z.boolean().optional() }).refine((v) => Object.keys(v).length > 0, "Provide at least one field to update");
const orgUpdate = z.object({ name: z.string().min(2).max(120).optional(), storageLimitBytes: z.number().int().positive().max(5_000_000_000_000).optional() }).refine((v) => Object.keys(v).length > 0, "Provide at least one field to update");

const endpoint = (fn: (req: Request, res: Response) => Promise<void>) => async (req: Request, res: Response, next: NextFunction) => { try { await fn(req, res); } catch (error) { next(error); } };
router.use(authenticate, authorize("OWNER"));
router.get("/users", endpoint(async (req, res) => { res.json({ success: true, users: await service.listUsers(req.auth!.organisationId) }); }));
router.post("/users", endpoint(async (req, res) => { const input = userCreate.parse(req.body); const user = await service.createUser(req.auth!.organisationId, req.auth!.userId, input); res.status(201).json({ success: true, user }); }));
router.patch("/users/:id", endpoint(async (req, res) => { const input = userUpdate.parse(req.body); const user = await service.updateUser(req.auth!.organisationId, req.auth!.userId, String(req.params.id), input); res.json({ success: true, user }); }));
router.get("/organisation", endpoint(async (req, res) => { res.json({ success: true, organisation: await service.getOrganisation(req.auth!.organisationId) }); }));
router.patch("/organisation", endpoint(async (req, res) => { const input = orgUpdate.parse(req.body); res.json({ success: true, organisation: await service.updateOrganisation(req.auth!.organisationId, req.auth!.userId, input) }); }));
router.get("/audit", endpoint(async (req, res) => { res.json({ success: true, entries: await service.listAudit(req.auth!.organisationId, Number(req.query.take) || 100) }); }));
router.get("/notifications", endpoint(async (req, res) => { res.json({ success: true, deliveries: await service.listNotifications(req.auth!.organisationId, Number(req.query.take) || 100) }); }));

export default router;
