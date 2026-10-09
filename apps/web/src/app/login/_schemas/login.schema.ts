import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, 'Email must be at most 254 characters.')
    .email('Enter a valid email address.'),
  password: z
    .string()
    .min(1, 'Enter your password.')
    .max(128, 'Password must be at most 128 characters.'),
});
export type LoginValues = z.infer<typeof loginSchema>;
