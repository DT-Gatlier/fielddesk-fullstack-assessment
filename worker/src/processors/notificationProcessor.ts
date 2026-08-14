import { Job } from 'bullmq';
import { PrismaClient, JobStatus } from '@prisma/client';
import { MockNotificationProvider } from '../providers/mockNotificationProvider';
import { logger } from '../utils/logger';

const prisma = new PrismaClient();

export const processNotification = async (job: Job) => {
  const { workOrderId, technicianId, orgId, jobRecordId } = job.data;
  const attemptNumber = job.attemptsMade + 1;

  logger.info({ jobId: job.id, workOrderId, technicianId, attemptNumber }, 'Processing notification job');

  try {
    // 1. Update DB to PROCESSING state on first attempt
    if (attemptNumber === 1) {
      await prisma.notificationJob.update({
        where: { id: jobRecordId },
        data: { status: JobStatus.PROCESSING, attempts: attemptNumber },
      });
    } else {
      await prisma.notificationJob.update({
        where: { id: jobRecordId },
        data: { attempts: attemptNumber },
      });
    }

    // 2. Call Provider
    const result = await MockNotificationProvider.sendNotification(technicianId, workOrderId);

    // 3. Handle Result
    if (result.success) {
      logger.info({ jobId: job.id }, 'Job completed successfully');
      
      await prisma.notificationJob.update({
        where: { id: jobRecordId },
        data: { 
          status: JobStatus.COMPLETED,
          completedAt: new Date(),
          lastError: null,
        },
      });

      await prisma.auditLog.create({
        data: {
          orgId,
          action: 'NOTIFICATION_SENT',
          targetType: 'WORK_ORDER',
          targetId: workOrderId,
          metadata: { technicianId, success: true },
        },
      });

      return { success: true };
    } 
    
    if (result.temporary) {
      logger.warn({ jobId: job.id, reason: result.reason }, 'Job temporary failure, will retry');
      
      await prisma.notificationJob.update({
        where: { id: jobRecordId },
        data: { lastError: result.reason },
      });

      // Throwing error triggers BullMQ retry (with backoff)
      throw new Error(`Temporary failure: ${result.reason}`);
    } 
    
    // Permanent failure
    logger.error({ jobId: job.id, reason: result.reason }, 'Job permanent failure, discarding');
    
    await prisma.notificationJob.update({
      where: { id: jobRecordId },
      data: { 
        status: JobStatus.FAILED,
        lastError: result.reason,
        completedAt: new Date(), // Using completedAt to mean "done processing"
      },
    });

    await prisma.auditLog.create({
      data: {
        orgId,
        action: 'NOTIFICATION_FAILED',
        targetType: 'WORK_ORDER',
        targetId: workOrderId,
        metadata: { technicianId, success: false, reason: result.reason },
      },
    });

    // We do NOT throw an error for permanent failures, because we don't want BullMQ to retry it.
    // Instead, we just let the job succeed in BullMQ's eyes, but we've marked it FAILED in our DB.
    return { success: false, reason: result.reason };

  } catch (error: any) {
    // If it's the last attempt and it failed, mark as FAILED in DB
    if (attemptNumber >= (job.opts.attempts || 5)) {
      logger.error({ jobId: job.id, err: error.message }, 'Job exhausted all retries');
      await prisma.notificationJob.update({
        where: { id: jobRecordId },
        data: { 
          status: JobStatus.FAILED,
          lastError: error.message,
          completedAt: new Date(),
        },
      });

      await prisma.auditLog.create({
        data: {
          orgId,
          action: 'NOTIFICATION_FAILED',
          targetType: 'WORK_ORDER',
          targetId: workOrderId,
          metadata: { technicianId, success: false, reason: error.message, retriesExhausted: true },
        },
      });
    }
    
    // Always re-throw temporary errors so BullMQ handles backoff
    throw error;
  }
};
