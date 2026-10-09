import { z } from 'zod';

export const createUserSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().trim().toLowerCase().email('Please enter a valid email address').max(254),
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
  role: z.enum(['OWNER', 'DISPATCHER', 'TECHNICIAN']),
});

export type CreateUserFormValues = z.infer<typeof createUserSchema>;

export const updateRoleSchema = z.object({
  role: z.enum(['OWNER', 'DISPATCHER', 'TECHNICIAN']),
});

export type UpdateRoleFormValues = z.infer<typeof updateRoleSchema>;
