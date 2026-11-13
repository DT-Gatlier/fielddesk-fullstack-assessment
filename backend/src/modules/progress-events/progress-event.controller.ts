import { Request, Response, NextFunction } from "express";
import { ProgressEventService } from "./progress-event.service";
import { createProgressEventSchema } from "./progress-event.validation";

const progressEventService = new ProgressEventService();

export class ProgressEventController {
  async submitEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const auth = req.auth!;
      const input = createProgressEventSchema.parse(req.body);
      const result = await progressEventService.processEvent(
        input,
        auth.organisationId,
        auth.role,
        auth.userId
      );

      const status = result.isDuplicate ? 200 : 201;
      res.status(status).json(result);
    } catch (error) {
      next(error);
    }
  }

  async listEvents(req: Request, res: Response, next: NextFunction) {
    try {
      const auth = req.auth!;
      const events = await progressEventService.getEventsForWorkOrder(
        String(req.params.workOrderId),
        auth.organisationId,
        auth.role,
        auth.userId
      );

      res.status(200).json({
        success: true,
        events,
      });
    } catch (error) {
      next(error);
    }
  }
}

