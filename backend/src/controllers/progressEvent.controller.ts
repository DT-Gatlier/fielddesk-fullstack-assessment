import { Request, Response, NextFunction } from 'express';
import { progressEventService } from '../services/progressEvent.service';
import { logger } from '../utils/logger';

export const submitEvent = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orgId = req.orgId!;
    const userId = req.user!.id;
    const role = req.user!.role;
    
    const { event, isDuplicate } = await progressEventService.submitEvent(orgId, req.body, userId, role);
    
    if (isDuplicate) {
      logger.info({ eventId: event.eventId, reqId: req.correlationId }, 'Duplicate event submission safely ignored');
      res.status(200).json(event); // 200 OK for duplicate (idempotent success)
    } else {
      res.status(201).json(event); // 201 Created for new event
    }
  } catch (error) {
    next(error);
  }
};
