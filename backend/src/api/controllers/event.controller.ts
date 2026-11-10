import { Request, Response, NextFunction } from 'express';
import { eventService } from '../../services/event.service.js';
import { ProgressEventDTO } from '../dtos/event.dto.js';

export class EventController {
  submitProgressEvent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const progressEvent = req.body as ProgressEventDTO;
      const result = await eventService.processEvent(req.tenantContext, id, progressEvent);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };
}

export const eventController = new EventController();

