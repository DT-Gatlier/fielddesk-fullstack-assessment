import { z } from 'zod';
import type { DynamicRouteConfig } from './dynamic.types.js';

const employeeFields = {
  name: z.string().trim().min(1).max(160),
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  department_id: z.string().uuid().nullable().optional()
};
const departmentFields = {
  name: z.string().trim().min(1).max(160),
  code: z.string().trim().min(1).max(30).regex(/^[A-Za-z0-9_-]+$/)
};

export const dynamicRoutes: DynamicRouteConfig[] = [
  {
    name: 'employees', table: 'employees', methods: ['GET', 'POST', 'PUT', 'DELETE', 'SELECT'],
    searchableFields: ['name', 'email'],
    selectableFields: ['id', 'name', 'email', 'department_id', 'created_at', 'updated_at'],
    selectValueField: 'name',
    sortableFields: ['name', 'created_at'], writableFields: Object.keys(employeeFields), pagination: true, auth: true,
    roles: { POST: ['owner', 'dispatcher'], PUT: ['owner', 'dispatcher'], DELETE: ['owner'] },
    createSchema: z.object(employeeFields).strict(), updateSchema: z.object(employeeFields).partial().strict()
  },
  {
    name: 'departments', table: 'departments', methods: ['GET', 'POST', 'PUT', 'SELECT'],
    searchableFields: ['name', 'code'],
    selectableFields: ['id', 'name', 'code', 'created_at', 'updated_at'],
    selectValueField: 'name',
    sortableFields: ['name', 'created_at'], writableFields: Object.keys(departmentFields), pagination: true, auth: true,
    roles: { POST: ['owner'], PUT: ['owner'] },
    createSchema: z.object(departmentFields).strict(), updateSchema: z.object(departmentFields).partial().strict()
  }
];
