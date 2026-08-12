import type { z } from 'zod';
import type { Role } from '../auth/auth.types.js';

export type DynamicMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'SELECT';

export interface DynamicRouteConfig {
  name: string;
  table: string;
  methods: DynamicMethod[];
  searchableFields?: string[];
  selectableFields: string[];
  selectValueField?: string;
  sortableFields?: string[];
  writableFields: string[];
  createSchema: z.ZodType<Record<string, unknown>>;
  updateSchema: z.ZodType<Record<string, unknown>>;
  pagination?: boolean;
  auth?: boolean;
  roles?: Partial<Record<DynamicMethod, Role[]>>;
}
