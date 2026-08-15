import { Response } from 'express';
import { prisma } from './db';
import { Prisma } from '@prisma/client';

export class CsvExporter {
  static sanitizeCell(val: any): string {
    if (val === null || val === undefined) return '';
    let str = String(val);

    // Prevent CSV injection (Formula Injection)
    if (/^[=+\-@\t\r]/.test(str)) {
      str = "'" + str;
    }

    // Escape double quotes and wrap in quotes if there are commas, quotes, or newlines
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      str = '"' + str.replace(/"/g, '""') + '"';
    }

    return str;
  }

  static async streamWorkOrders(orgId: string, res: Response, filters: any = {}) {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="work_orders.csv"');

    const headers = [
      'Reference Number',
      'Title',
      'Status',
      'Priority',
      'Site Name',
      'Assigned Technician',
      'Scheduled Start',
      'Scheduled End',
      'Created At',
    ];

    res.write(headers.map(this.sanitizeCell).join(',') + '\n');

    let cursor: string | undefined = undefined;
    const batchSize = 100;

    const where: Prisma.WorkOrderWhereInput = { orgId, ...filters };

    while (true) {
      const records = await prisma.workOrder.findMany({
        where,
        take: batchSize,
        skip: cursor ? 1 : 0,
        ...(cursor && { cursor: { id: cursor } }),
        orderBy: { id: 'asc' },
        include: {
          assignedTechnician: { select: { email: true } },
        },
      });

      if (records.length === 0) {
        break;
      }

      for (const record of records) {
        const row = [
          record.referenceNumber,
          record.title,
          record.status,
          record.priority,
          record.siteName,
          record.assignedTechnician?.email || 'Unassigned',
          record.scheduledStart ? record.scheduledStart.toISOString() : '',
          record.scheduledEnd ? record.scheduledEnd.toISOString() : '',
          record.createdAt.toISOString(),
        ];
        res.write(row.map(this.sanitizeCell).join(',') + '\n');
      }

      cursor = records[records.length - 1].id;
    }

    res.end();
  }
}
