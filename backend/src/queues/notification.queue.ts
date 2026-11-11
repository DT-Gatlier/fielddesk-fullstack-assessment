import { Queue, QueueOptions, JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../infrastructure/config.js';
import { logger } from '../infrastructure/logger.js';

export interface NotificationJobData {
  workOrderId: string;
  technicianId: string;
  organisationId: string;
  simulationMode?: 'always_success' | 'temporary_failure' | 'permanent_failure' | 'random';
  [key: string]: any;
}

export interface EnqueuedJobRecord {
  id: string;
  name: string;
  data: NotificationJobData;
  opts?: JobsOptions;
  timestamp: number;
}

let bullQueue: Queue<NotificationJobData> | null = null;
const inMemoryJobs: EnqueuedJobRecord[] = [];

function getBullQueue(): Queue<NotificationJobData> | null {
  if (config.NODE_ENV === 'test') {
    return null;
  }

  if (!bullQueue) {
    try {
      const connection = new Redis(config.REDIS_URL, {
        maxRetriesPerRequest: null,
        lazyConnect: true,
      });

      connection.on('error', (err) => {
        logger.warn({ err: err.message }, 'BullMQ Redis connection warning in API');
      });

      bullQueue = new Queue<NotificationJobData>('technician-notifications', {
        connection,
      });

      bullQueue.on('error', (err) => {
        logger.warn({ err: err.message }, 'BullMQ Queue error');
      });
    } catch (err: any) {
      logger.warn({ err: err.message }, 'Failed to initialize BullMQ Queue, using in-memory queue');
      bullQueue = null;
    }
  }
  return bullQueue;
}

export const notificationQueue = {
  add: async (
    name: string,
    data: NotificationJobData,
    opts?: JobsOptions
  ): Promise<EnqueuedJobRecord> => {
    const queue = getBullQueue();
    const jobId = opts?.jobId || `notify:${data.organisationId}:${data.workOrderId}:${data.technicianId}`;

    const record: EnqueuedJobRecord = {
      id: jobId,
      name,
      data,
      opts: {
        jobId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        ...opts,
      },
      timestamp: Date.now(),
    };

    if (queue) {
      try {
        await queue.add(name, data, record.opts);
      } catch (err: any) {
        logger.warn({ err: err.message }, 'Could not add job to live Redis queue; falling back to in-memory');
      }
    }

    inMemoryJobs.push(record);

    logger.info(
      {
        jobId,
        jobName: name,
        workOrderId: data.workOrderId,
        technicianId: data.technicianId,
        attempts: record.opts?.attempts,
      },
      'Enqueued technician assignment notification job'
    );

    return record;
  },

  getJobs: (): EnqueuedJobRecord[] => {
    return [...inMemoryJobs];
  },

  clear: (): void => {
    inMemoryJobs.length = 0;
  },

  close: async (): Promise<void> => {
    if (bullQueue) {
      await bullQueue.close();
      bullQueue = null;
    }
    inMemoryJobs.length = 0;
  },
};

