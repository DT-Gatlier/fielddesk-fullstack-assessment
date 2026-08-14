import { Request, Response, NextFunction } from 'express';
import { workOrderService } from '../services/workOrder.service';
import { prisma } from '../utils/db';
import { NotFoundError } from '../utils/errors';

export const listWorkOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.orgId!;
    const userId = req.user!.id;
    const role = req.user!.role;
    const query = req.query;

    const result = await workOrderService.getWorkOrders(orgId, query, role, userId);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

export const getWorkOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.orgId!;
    const userId = req.user!.id;
    const role = req.user!.role;
    const id = req.params.id;

    const workOrder = await workOrderService.getWorkOrderById(orgId, id, role, userId);
    res.json(workOrder);
  } catch (error) {
    next(error);
  }
};

export const createWorkOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.orgId!;
    const userId = req.user!.id;
    
    // Check for reference number collision within the org
    const existing = await prisma.workOrder.findUnique({
      where: { orgId_referenceNumber: { orgId, referenceNumber: req.body.referenceNumber } }
    });
    
    if (existing) {
      return res.status(409).json({ error: { message: 'Reference number already exists in this organization' } });
    }

    const workOrder = await workOrderService.createWorkOrder(orgId, req.body, userId);
    res.status(201).json(workOrder);
  } catch (error) {
    next(error);
  }
};

export const updateWorkOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.orgId!;
    const userId = req.user!.id;
    const id = req.params.id;

    const workOrder = await workOrderService.updateWorkOrder(orgId, id, req.body, userId);
    res.json(workOrder);
  } catch (error) {
    next(error);
  }
};

export const getDashboardSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.orgId!;
    const userId = req.user!.id;
    const role = req.user!.role;

    const summary = await workOrderService.getDashboardSummary(orgId, role, userId);
    res.json(summary);
  } catch (error) {
    next(error);
  }
};

export const getAuditHistory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.orgId!;
    const id = req.params.id;
    
    // Validate existence and access
    await workOrderService.getWorkOrderById(orgId, id, req.user!.role, req.user!.id);

    const logs = await prisma.auditLog.findMany({
      where: { orgId, targetType: 'WORK_ORDER', targetId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        actor: { select: { id: true, email: true, role: true } },
      }
    });

    res.json(logs);
  } catch (error) {
    next(error);
  }
};

export const assignTechnician = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.orgId!;
    const userId = req.user!.id;
    const id = req.params.id;
    const { assignedTechnicianId, scheduledStart, scheduledEnd } = req.body;

    const workOrder = await workOrderService.assignTechnician(
      orgId, 
      id, 
      assignedTechnicianId, 
      new Date(scheduledStart), 
      new Date(scheduledEnd), 
      userId
    );
    
    res.json(workOrder);
  } catch (error) {
    next(error);
  }
};
