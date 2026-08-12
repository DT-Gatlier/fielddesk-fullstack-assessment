import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { badRequest } from '../../common/errors.js';
import type { Config } from '../../config.js';
import type { Database } from '../../database/pool.js';
import { authenticate, getIdentity, requireRoles } from '../auth/auth.middleware.js';
import { DynamicRepository } from './dynamic.repository.js';
import type { DynamicMethod, DynamicRouteConfig } from './dynamic.types.js';

const idParams = z.object({ id: z.string().uuid() });

function guards(method: DynamicMethod, route: DynamicRouteConfig, config: Config, database: Database): RequestHandler[] {
  if (!route.auth) return [];
  const handlers: RequestHandler[] = [authenticate(config, database)];
  const allowed = route.roles?.[method];
  if (allowed?.length) handlers.push(requireRoles(...allowed));
  return handlers;
}

export function createDynamicRouter(database: Database, config: Config, routes: DynamicRouteConfig[]): Router {
  const root = Router();
  for (const route of routes) {
    const router = Router();
    const repository = new DynamicRepository(database, route.table);
    const defaultSort = route.sortableFields?.[0] ?? 'created_at';

    if (route.methods.includes('GET')) {
      router.get('/', ...guards('GET', route, config, database), asyncHandler(async (request, response) => {
        const identity = getIdentity(request.identity);
        const query = z.object({
          search: z.string().trim().max(200).optional(),
          sort: z.string().optional().default(defaultSort),
          direction: z.enum(['asc', 'desc']).default('asc'),
          page: z.coerce.number().int().positive().default(1),
          limit: z.coerce.number().int().min(1).max(100).default(20)
        }).parse(request.query);
        if (!(route.sortableFields ?? [defaultSort]).includes(query.sort)) throw badRequest('Unsupported sort field');
        const { rows, total } = await repository.list({
          organisationId: identity.organisationId, fields: route.selectableFields,
          searchable: route.searchableFields ?? [], ...(query.search ? { search: query.search } : {}),
          sort: query.sort, direction: query.direction,
          page: route.pagination ? query.page : 1, limit: route.pagination ? query.limit : 100
        });
        response.json({ data: rows, meta: { page: query.page, limit: query.limit, total } });
      }));
    }

    if (route.methods.includes('SELECT')) {
      if (!route.selectValueField) throw new Error(`Dynamic route ${route.name} requires selectValueField for SELECT`);
      router.get('/select/options', ...guards('SELECT', route, config, database), asyncHandler(async (request, response) => {
        const identity = getIdentity(request.identity);
        const { rows } = await repository.list({
          organisationId: identity.organisationId, fields: ['id', route.selectValueField!],
          searchable: route.searchableFields ?? [], ...(typeof request.query.search === 'string' ? { search: request.query.search } : {}),
          sort: defaultSort, direction: 'asc', page: 1, limit: 100
        });
        response.json({ data: rows.map((row) => ({ id: row.id, value: row[route.selectValueField!] })) });
      }));
    }

    if (route.methods.includes('GET')) {
      router.get('/:id', ...guards('GET', route, config, database), asyncHandler(async (request, response) => {
        const { id } = idParams.parse(request.params);
        response.json({ data: await repository.find(getIdentity(request.identity).organisationId, id, route.selectableFields) });
      }));
    }

    if (route.methods.includes('POST')) {
      router.post('/', ...guards('POST', route, config, database), asyncHandler(async (request, response) => {
        const data = route.createSchema.parse(request.body);
        response.status(201).json({ data: await repository.create(getIdentity(request.identity).organisationId, data, route.selectableFields) });
      }));
    }

    if (route.methods.includes('PUT')) {
      router.put('/:id', ...guards('PUT', route, config, database), asyncHandler(async (request, response) => {
        const { id } = idParams.parse(request.params);
        const data = route.updateSchema.parse(request.body);
        if (!Object.keys(data).length) throw badRequest('At least one field is required');
        response.json({ data: await repository.update(getIdentity(request.identity).organisationId, id, data, route.selectableFields) });
      }));
    }

    if (route.methods.includes('DELETE')) {
      router.delete('/:id', ...guards('DELETE', route, config, database), asyncHandler(async (request, response) => {
        const { id } = idParams.parse(request.params);
        await repository.delete(getIdentity(request.identity).organisationId, id);
        response.status(204).send();
      }));
    }
    root.use(`/${route.name}`, router);
  }
  return root;
}
