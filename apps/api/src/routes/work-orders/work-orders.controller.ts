import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import 'multer';

import {
  CurrentIdentity,
  RequirePermission,
} from '../../http/decorators/auth.decorators';
import { AttachmentService } from '../../modules/attachment/services/attachment.service';
import type { Identity } from '../../modules/auth/interfaces/auth-identity.interface';
import { WorkOrderService } from '../../modules/work-order/services/work-order.service';
import { AssignWorkOrderDto } from './dtos/assign-work-order.dto';
import { AttachmentResDto } from './dtos/attachment-res.dto';
import { CreateWorkOrderDto } from './dtos/create-work-order.dto';
import { ExportWorkOrdersQueryDto } from './dtos/export-work-orders-query.dto';
import { ListWorkOrdersQueryDto } from './dtos/list-work-orders-query.dto';
import { UpdateWorkOrderStatusDto } from './dtos/update-work-order-status.dto';
import { UpdateWorkOrderDto } from './dtos/update-work-order.dto';
import { SubmitProgressEventDto } from './dtos/submit-progress-event.dto';
import { WorkOrderEventResDto } from './dtos/work-order-event-res.dto';
import { WorkOrderListResDto } from './dtos/work-order-list-res.dto';
import { WorkOrderResDto } from './dtos/work-order-res.dto';

@ApiTags('Work Orders')
@ApiCookieAuth('session')
@Controller('api/v1/work-orders')
export class WorkOrdersController {
  constructor(
    private readonly workOrders: WorkOrderService,
    private readonly attachments: AttachmentService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List work orders with role-aware scoping' })
  @ApiResponse({ status: 200, type: WorkOrderListResDto })
  async list(
    @CurrentIdentity() identity: Identity,
    @Query() query: ListWorkOrdersQueryDto,
  ): Promise<WorkOrderListResDto> {
    const context = { organisationId: identity.organisation.id };
    const result = await this.workOrders.list(
      context,
      {
        status: query.status,
        priority: query.priority,
        assignedTechnicianId: query.assignedTechnicianId,
        search: query.search,
      },
      { page: query.page, limit: query.limit },
      identity.role,
      identity.id,
    );
    return WorkOrderListResDto.fromData(result);
  }

  @Get('export')
  @ApiOperation({ summary: 'Stream organization work orders as sanitized CSV' })
  @ApiResponse({
    status: 200,
    description: 'RFC 4180 compliant CSV stream with formula injection sanitization',
  })
  async export(
    @CurrentIdentity() identity: Identity,
    @Query() query: ExportWorkOrdersQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const context = { organisationId: identity.organisation.id };
    const today = new Date().toISOString().split('T')[0];

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="work-orders-${today}.csv"`,
    );
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    await this.workOrders.exportCsvStream(
      context,
      {
        status: query.status,
        priority: query.priority,
        assignedTechnicianId: query.assignedTechnicianId,
        search: query.search,
      },
      identity.role,
      identity.id,
      res,
    );
  }

  @Post()
  @RequirePermission('work:manage')
  @ApiOperation({ summary: 'Create a new work order' })
  @ApiResponse({ status: 201, type: WorkOrderResDto })
  async create(
    @CurrentIdentity() identity: Identity,
    @Body() dto: CreateWorkOrderDto,
  ): Promise<WorkOrderResDto> {
    const context = { organisationId: identity.organisation.id };
    const result = await this.workOrders.create(context, identity.id, {
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      siteName: dto.siteName,
      assignedTechnicianId: dto.assignedTechnicianId,
      scheduledStart: dto.scheduledStart,
      scheduledEnd: dto.scheduledEnd,
    });
    return WorkOrderResDto.fromData(result);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get work order details' })
  @ApiResponse({ status: 200, type: WorkOrderResDto })
  async getById(
    @CurrentIdentity() identity: Identity,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkOrderResDto> {
    const context = { organisationId: identity.organisation.id };
    const result = await this.workOrders.getById(
      context,
      id,
      identity.role,
      identity.id,
    );
    return WorkOrderResDto.fromData(result);
  }

  @Patch(':id')
  @RequirePermission('work:manage')
  @ApiOperation({ summary: 'Update work order details' })
  @ApiResponse({ status: 200, type: WorkOrderResDto })
  async update(
    @CurrentIdentity() identity: Identity,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkOrderDto,
  ): Promise<WorkOrderResDto> {
    const context = { organisationId: identity.organisation.id };
    const result = await this.workOrders.update(context, id, {
      title: dto.title,
      description: dto.description,
      priority: dto.priority,
      siteName: dto.siteName,
    });
    return WorkOrderResDto.fromData(result);
  }

  @Post(':id/assign')
  @RequirePermission('work:manage')
  @ApiOperation({
    summary:
      'Assign technician and schedule window with concurrency overlap protection',
  })
  @ApiResponse({ status: 200, type: WorkOrderResDto })
  async assign(
    @CurrentIdentity() identity: Identity,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignWorkOrderDto,
  ): Promise<WorkOrderResDto> {
    const context = { organisationId: identity.organisation.id };
    const result = await this.workOrders.assign(
      context,
      id,
      {
        assignedTechnicianId: dto.assignedTechnicianId,
        scheduledStart: dto.scheduledStart,
        scheduledEnd: dto.scheduledEnd,
      },
      identity.id,
    );
    return WorkOrderResDto.fromData(result);
  }

  @Post(':id/status')
  @ApiOperation({ summary: 'Update work order status' })
  @ApiResponse({ status: 200, type: WorkOrderResDto })
  async updateStatus(
    @CurrentIdentity() identity: Identity,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWorkOrderStatusDto,
  ): Promise<WorkOrderResDto> {
    const context = { organisationId: identity.organisation.id };
    const result = await this.workOrders.updateStatus(
      context,
      id,
      { status: dto.status },
      identity.role,
      identity.id,
    );
    return WorkOrderResDto.fromData(result);
  }

  @Post(':id/events')
  @RequirePermission(['progress:write', 'work:manage'])
  @ApiOperation({
    summary: 'Submit an immutable progress event with idempotent deduplication',
  })
  @ApiResponse({ status: 201, type: WorkOrderEventResDto })
  @ApiResponse({
    status: 409,
    description:
      'Conflict on invalid status transition or duplicate event ID mismatch',
  })
  async submitEvent(
    @CurrentIdentity() identity: Identity,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitProgressEventDto,
  ): Promise<WorkOrderEventResDto> {
    const context = { organisationId: identity.organisation.id };
    const result = await this.workOrders.submitProgressEvent(
      context,
      id,
      {
        eventId: dto.eventId,
        type: dto.type,
        occurredAt: dto.occurredAt,
        payload: dto.payload,
      },
      identity.role,
      identity.id,
    );
    return WorkOrderEventResDto.fromData(result);
  }

  @Get(':id/events')
  @RequirePermission(['work:assigned', 'work:manage'])
  @ApiOperation({
    summary: 'Get chronological activity history of work order events',
  })
  @ApiResponse({ status: 200, type: [WorkOrderEventResDto] })
  async listEvents(
    @CurrentIdentity() identity: Identity,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkOrderEventResDto[]> {
    const context = { organisationId: identity.organisation.id };
    const results = await this.workOrders.listEvents(
      context,
      id,
      identity.role,
      identity.id,
    );
    return results.map((event) => WorkOrderEventResDto.fromData(event));
  }

  @Post(':id/attachments')
  @RequirePermission(['work:assigned', 'work:manage'])
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload an attachment to a work order' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 201, type: AttachmentResDto })
  async uploadAttachment(
    @CurrentIdentity() identity: Identity,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<AttachmentResDto> {
    const context = { organisationId: identity.organisation.id };
    const result = await this.attachments.upload(context, {
      workOrderId: id,
      uploaderId: identity.id,
      userRole: identity.role,
      file,
    });
    return AttachmentResDto.fromData(result);
  }

  @Get(':id/attachments')
  @RequirePermission(['work:assigned', 'work:manage'])
  @ApiOperation({ summary: 'List attachments for a work order' })
  @ApiResponse({ status: 200, type: [AttachmentResDto] })
  async listAttachments(
    @CurrentIdentity() identity: Identity,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AttachmentResDto[]> {
    const context = { organisationId: identity.organisation.id };
    const results = await this.attachments.list(
      context,
      id,
      identity.role,
      identity.id,
    );
    return results.map((att) => AttachmentResDto.fromData(att));
  }

  @Get(':id/attachments/:attachmentId')
  @RequirePermission(['work:assigned', 'work:manage'])
  @ApiOperation({ summary: 'Download or view a work order attachment' })
  async downloadAttachment(
    @CurrentIdentity() identity: Identity,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const context = { organisationId: identity.organisation.id };
    const result = await this.attachments.getStream(
      context,
      id,
      attachmentId,
      identity.role,
      identity.id,
    );

    const encodedName = encodeURIComponent(result.originalFileName);
    const asciiFallback = result.originalFileName.replace(/[^\x20-\x7e]/g, '_');

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Length', result.byteSize);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');

    result.stream.on('error', (streamErr) => {
      if (!res.headersSent) {
        res.status(500).json({
          code: 'INTERNAL_ERROR',
          message: 'Failed to read file from storage',
          requestId: (res.req as { requestId?: string })?.requestId,
        });
      } else {
        res.destroy(streamErr);
      }
    });

    result.stream.pipe(res);
  }

  @Delete(':id/attachments/:attachmentId')
  @HttpCode(204)
  @RequirePermission(['work:assigned', 'work:manage'])
  @ApiOperation({ summary: 'Delete a work order attachment' })
  @ApiResponse({ status: 204, description: 'Attachment deleted successfully' })
  async deleteAttachment(
    @CurrentIdentity() identity: Identity,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ): Promise<void> {
    const context = { organisationId: identity.organisation.id };
    await this.attachments.delete(
      context,
      id,
      attachmentId,
      identity.role,
      identity.id,
    );
  }
}
