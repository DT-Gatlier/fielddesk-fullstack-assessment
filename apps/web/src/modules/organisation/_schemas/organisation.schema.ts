import { z } from 'zod';

export const updateOrganisationSchema = z.object({
  name: z.string().trim().min(2, 'Organisation name must be at least 2 characters').max(100, 'Organisation name cannot exceed 100 characters'),
});

export type UpdateOrganisationFormValues = z.infer<typeof updateOrganisationSchema>;
