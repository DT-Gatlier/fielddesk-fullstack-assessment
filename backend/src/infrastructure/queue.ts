import { logger } from './logger.js';
import { getRedisClient } from './redis.js';

export interface NotificationJobData {
  workOrderId: string;
  technicianId: string;
  organisationId: string;
  [key: string]: any;
}

export interface EnqueuedJob {
  id: string;
  name: string;
  data: NotificationJobData;
  timestamp: number;
}

class NotificationQueue {
  private inMemoryQueue: EnqueuedJob[] = [];

  async add(name: string, data: NotificationJobData): Promise<EnqueuedJob> {
    const job: EnqueuedJob = {
      id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      name,
      data,
      timestamp: Date.now(),
    };

    try {
      const redis = getRedisClient();
      await redis.lpush('queue:technician-notifications', JSON.stringify(job));
    } catch {
      // Fallback for tests or disconnected redis
    }

    this.inMemoryQueue.push(job);
    logger.info(
      { jobId: job.id, jobName: name, workOrderId: data.workOrderId, technicianId: data.technicianId },
      'Enqueued technician notification job'
    );

    return job;
  }

  getJobs(): EnqueuedJob[] {
    return this.inMemoryQueue;
  }

  clear(): void {
    this.inMemoryQueue = [];
  }
}

export const notificationQueue = new NotificationQueue();

