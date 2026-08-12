import type { Database } from '../../database/pool.js';
import { notFound } from '../../common/errors.js';

const identifier = /^[a-z_][a-z0-9_]*$/;
const quote = (value: string) => {
  if (!identifier.test(value)) throw new Error(`Unsafe SQL identifier: ${value}`);
  return `"${value}"`;
};

export class DynamicRepository {
  constructor(private readonly database: Database, private readonly table: string) {
    quote(table);
  }

  async list(input: {
    organisationId: string; fields: string[]; searchable: string[]; search?: string;
    sort: string; direction: 'asc' | 'desc'; page: number; limit: number;
  }) {
    const parameters: unknown[] = [input.organisationId];
    let where = 'organisation_id = $1';
    if (input.search && input.searchable.length) {
      parameters.push(`%${input.search}%`);
      where += ` AND (${input.searchable.map((field) => `${quote(field)} ILIKE $${parameters.length}`).join(' OR ')})`;
    }
    parameters.push(input.limit, (input.page - 1) * input.limit);
    const result = await this.database.query(
      `SELECT ${input.fields.map(quote).join(', ')} FROM ${quote(this.table)} WHERE ${where}
       ORDER BY ${quote(input.sort)} ${input.direction} LIMIT $${parameters.length - 1} OFFSET $${parameters.length}`,
      parameters
    );
    const count = await this.database.query<{ count: string }>(
      `SELECT count(*) FROM ${quote(this.table)} WHERE ${where}`,
      parameters.slice(0, -2)
    );
    return { rows: result.rows, total: Number(count.rows[0]?.count ?? 0) };
  }

  async find(organisationId: string, id: string, fields: string[]) {
    const result = await this.database.query(
      `SELECT ${fields.map(quote).join(', ')} FROM ${quote(this.table)} WHERE organisation_id = $1 AND id = $2`,
      [organisationId, id]
    );
    if (!result.rows[0]) throw notFound();
    return result.rows[0];
  }

  async create(organisationId: string, data: Record<string, unknown>, fields: string[]) {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const columns = ['organisation_id', ...keys].map(quote).join(', ');
    const placeholders = values.map((_, index) => `$${index + 2}`).join(', ');
    const result = await this.database.query(
      `INSERT INTO ${quote(this.table)} (${columns}) VALUES ($1${placeholders ? `, ${placeholders}` : ''}) RETURNING ${fields.map(quote).join(', ')}`,
      [organisationId, ...values]
    );
    return result.rows[0];
  }

  async update(organisationId: string, id: string, data: Record<string, unknown>, fields: string[]) {
    const entries = Object.entries(data);
    const assignments = entries.map(([key], index) => `${quote(key)} = $${index + 3}`).join(', ');
    const result = await this.database.query(
      `UPDATE ${quote(this.table)} SET ${assignments}, updated_at = now()
       WHERE organisation_id = $1 AND id = $2 RETURNING ${fields.map(quote).join(', ')}`,
      [organisationId, id, ...entries.map(([, value]) => value)]
    );
    if (!result.rows[0]) throw notFound();
    return result.rows[0];
  }

  async delete(organisationId: string, id: string) {
    const result = await this.database.query(
      `DELETE FROM ${quote(this.table)} WHERE organisation_id = $1 AND id = $2 RETURNING id`,
      [organisationId, id]
    );
    if (!result.rows[0]) throw notFound();
  }
}
