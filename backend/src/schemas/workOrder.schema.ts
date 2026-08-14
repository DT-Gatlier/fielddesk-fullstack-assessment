import { z } from 'zod';
import { Priority, Status } from '@prisma/client';

export const createWorkOrderSchema = z.object({
  body: z.object({
    referenceNumber: z.string().min(1, 'Reference number is required'),
    title: z.string().min(1, 'Title is required'),
    description: z.string().min(1, 'Description is required'),
    priority: z.nativeEnum(Priority).optional(),
    status: z.nativeEnum(Status).optional(),
    siteName: z.string().min(1, 'Site name is required'),
    assignedTechnicianId: z.string().uuid().optional().nullable(),
    scheduledStart: z.string().datetime().optional().nullable(),
    scheduledEnd: z.string().datetime().optional().nullable(),
  }).refine((data) => {
    // If one schedule field is provided, the other must be too
    if ((data.scheduledStart && !data.scheduledEnd) || (!data.scheduledStart && data.scheduledEnd)) {
      return false;
    }
    return true;
  }, {
    message: 'Both scheduledStart and scheduledEnd must be provided together',
    path: ['scheduledStart'],
  }).refine((data) => {
    if (data.scheduledStart && data.scheduledEnd) {
      return new Date(data.scheduledStart) < new Date(data.scheduledEnd);
    }
    return true;
  }, {
    message: 'scheduledEnd must be after scheduledStart',
    path: ['scheduledEnd'],
  }),
});

export const updateWorkOrderSchema = z.object({
  body: z.object({
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    priority: z.nativeEnum(Priority).optional(),
    status: z.nativeEnum(Status).optional(),
    siteName: z.string().min(1).optional(),
    assignedTechnicianId: z.string().uuid().optional().nullable(),
    scheduledStart: z.string().datetime().optional().nullable(),
    scheduledEnd: z.string().datetime().optional().nullable(),
  }).refine((data) => {
    if (data.scheduledStart !== undefined || data.scheduledEnd !== undefined) {
      if ((data.scheduledStart && !data.scheduledEnd) || (!data.scheduledStart && data.scheduledEnd)) {
        return false;
      }
    }
    return true;
  }, {
    message: 'Both scheduledStart and scheduledEnd must be provided together',
    path: ['scheduledStart'],
  }).refine((data) => {
    if (data.scheduledStart && data.scheduledEnd) {
      return new Date(data.scheduledStart) < new Date(data.scheduledEnd);
    }
    return true;
  }, {
    message: 'scheduledEnd must be after scheduledStart',
    path: ['scheduledEnd'],
  }),
});

export const listWorkOrdersSchema = z.object({
  query: z.object({
    page: z.coerce.number().min(1).default(1),
    limit: z.coerce.number().min(1).max(100).default(20),
    status: z.nativeEnum(Status).optional(),
    priority: z.nativeEnum(Priority).optional(),
    assignedTechnicianId: z.string().uuid().optional(),
    search: z.string().optional(),
    sortBy: z.enum(['createdAt', 'scheduledStart', 'priority']).default('createdAt'),
    sortDir: z.enum(['asc', 'desc']).default('desc'),
  }),
});

export const assignTechnicianSchema = z.object({
  body: z.object({
    assignedTechnicianId: z.string().uuid('Technician ID must be a valid UUID'),
    scheduledStart: z.string().datetime(),
    scheduledEnd: z.string().datetime(),
  }).refine((data) => new Date(data.scheduledStart) < new Date(data.scheduledEnd), {
    message: 'scheduledEnd must be after scheduledStart',
    path: ['scheduledEnd'],
  }),
});
