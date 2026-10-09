import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../../database/prisma.service';
import { RealtimeService } from '../../realtime/services/realtime.service';
import { UserService } from '../../user/services/user.service';
import { WORK_ORDER_EVENT_REPOSITORY } from '../interfaces/work-order-event.interface';
import { WORK_ORDER_REPOSITORY } from '../interfaces/work-order-repository.interface';
import type { WorkOrderRepositoryPort } from '../interfaces/work-order-repository.interface';
import type { Response } from 'express';
import { InAppNotificationService } from '../../notification/services/in-app-notification.service';
import type { WorkOrderSummary } from '../interfaces/work-order.interface';
import { WorkOrderService } from './work-order.service';

describe('WorkOrderService', () => {
  let findWorkOrderByIdMock: jest.Mock;
  let listByOrganisationMock: jest.Mock;
  let countByOrganisationMock: jest.Mock;
  let createWorkOrderMock: jest.Mock;
  let updateWorkOrderMock: jest.Mock;
  let updateAssignmentMock: jest.Mock;
  let updateStatusMock: jest.Mock;

  let findByEventIdMock: jest.Mock;
  let listByWorkOrderIdMock: jest.Mock;
  let recordEventWithWorkOrderLockMock: jest.Mock;
  let streamByOrganisationMock: jest.Mock;

  let getUserByIdMock: jest.Mock;
  let enqueueInTransactionMock: jest.Mock;

  let workOrderRepo: WorkOrderRepositoryPort;
  let eventRepo: unknown;
  let userService: Partial<UserService>;
  let mockRealtime: {
    broadcastToOrganisation: jest.Mock;
    createEventStream: jest.Mock;
  };
  let module: TestingModule;
  let service: WorkOrderService;

  const tenant = { organisationId: '11111111-1111-1111-1111-111111111111' };
  const mockWorkOrder: WorkOrderSummary = {
    id: 'wo-1',
    organisationId: tenant.organisationId,
    reference: 'WO-0001',
    title: 'AC Fix',
    description: 'Leaking water',
    priority: 'MEDIUM',
    status: 'DRAFT',
    siteName: 'Site 1',
    creatorId: 'user-1',
    creatorName: 'Arjun',
    assignedTechnicianId: null,
    assignedTechnicianName: null,
    scheduledStart: null,
    scheduledEnd: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    findWorkOrderByIdMock = jest.fn();
    listByOrganisationMock = jest.fn();
    countByOrganisationMock = jest.fn();
    createWorkOrderMock = jest.fn();
    updateWorkOrderMock = jest.fn();
    updateAssignmentMock = jest.fn();
    updateStatusMock = jest.fn();
    streamByOrganisationMock = jest.fn();

    findByEventIdMock = jest.fn();
    listByWorkOrderIdMock = jest.fn();
    recordEventWithWorkOrderLockMock = jest.fn();

    getUserByIdMock = jest.fn();
    enqueueInTransactionMock = jest.fn().mockResolvedValue(undefined);

    workOrderRepo = {
      findById: findWorkOrderByIdMock,
      listByOrganisation: listByOrganisationMock,
      streamByOrganisation: streamByOrganisationMock,
      countByOrganisation: countByOrganisationMock,
      create: createWorkOrderMock,
      update: updateWorkOrderMock,
      updateAssignment: updateAssignmentMock,
      updateStatus: updateStatusMock,
    };

    eventRepo = {
      findByEventId: findByEventIdMock,
      listByWorkOrderId: listByWorkOrderIdMock,
      recordEventWithWorkOrderLock: recordEventWithWorkOrderLockMock,
    };

    userService = {
      getById: getUserByIdMock,
    };

    const mockPrisma = {
      client: {
        $transaction: jest.fn().mockImplementation((cb: (tx: unknown) => Promise<unknown>) => cb({})),
      },
    };

    const mockNotificationRepo = {
      enqueueInTransaction: enqueueInTransactionMock,
      fetchAndLockBatch: jest.fn().mockResolvedValue([]),
      markDelivered: jest.fn().mockResolvedValue(undefined),
      markTransientFailure: jest.fn().mockResolvedValue(undefined),
      markPermanentFailure: jest.fn().mockResolvedValue(undefined),
    };

    mockRealtime = {
      broadcastToOrganisation: jest.fn().mockResolvedValue(undefined),
      createEventStream: jest.fn(),
    };

    const mockInAppNotifications = {
      dispatchNotification: jest.fn().mockResolvedValue([]),
      listNotifications: jest.fn().mockResolvedValue({ items: [], unreadCount: 0 }),
      markAsRead: jest.fn().mockResolvedValue(null),
      markAllAsRead: jest.fn().mockResolvedValue(0),
      clearAll: jest.fn().mockResolvedValue(0),
    };

    module = await Test.createTestingModule({
      providers: [
        WorkOrderService,
        { provide: WORK_ORDER_REPOSITORY, useValue: workOrderRepo },
        { provide: WORK_ORDER_EVENT_REPOSITORY, useValue: eventRepo },
        { provide: UserService, useValue: userService },
        { provide: 'NotificationRepositoryPort', useValue: mockNotificationRepo },
        { provide: InAppNotificationService, useValue: mockInAppNotifications },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RealtimeService, useValue: mockRealtime },
      ],
    }).compile();

    service = module.get(WorkOrderService);
  });

  afterEach(async () => {
    await module.close();
  });

  describe('Technician Scope Boundary', () => {
    it('restricts technician listing to only their assigned work', async () => {
      listByOrganisationMock.mockResolvedValue({
        items: [mockWorkOrder],
        total: 1,
        page: 1,
        limit: 20,
      });

      await service.list(
        tenant,
        {},
        { page: 1, limit: 20 },
        'TECHNICIAN',
        'tech-id-123',
      );

      expect(listByOrganisationMock).toHaveBeenCalledWith(
        tenant.organisationId,
        expect.objectContaining({ assignedTechnicianId: 'tech-id-123' }),
        { page: 1, limit: 20 },
      );
    });

    it('rejects technician viewing another technician work order with 404', async () => {
      findWorkOrderByIdMock.mockResolvedValue({
        ...mockWorkOrder,
        assignedTechnicianId: 'other-tech-id',
      });

      await expect(
        service.getById(tenant, 'wo-1', 'TECHNICIAN', 'my-tech-id'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Scheduling & Assignment', () => {
    it('rejects scheduling window when start is after end', async () => {
      findWorkOrderByIdMock.mockResolvedValue(mockWorkOrder);

      const start = new Date('2026-10-10T12:00:00Z');
      const end = new Date('2026-10-10T11:00:00Z');

      await expect(
        service.assign(tenant, 'wo-1', {
          assignedTechnicianId: 'tech-1',
          scheduledStart: start,
          scheduledEnd: end,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects assignment if target user is not a technician', async () => {
      findWorkOrderByIdMock.mockResolvedValue(mockWorkOrder);
      getUserByIdMock.mockResolvedValue({
        id: 'user-dispatcher',
        organisationId: tenant.organisationId,
        email: 'disp@test.com',
        name: 'Meera',
        role: 'DISPATCHER',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const start = new Date('2026-10-10T10:00:00Z');
      const end = new Date('2026-10-10T12:00:00Z');

      await expect(
        service.assign(tenant, 'wo-1', {
          assignedTechnicianId: 'user-dispatcher',
          scheduledStart: start,
          scheduledEnd: end,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects rescheduling if work order is already IN_PROGRESS', async () => {
      findWorkOrderByIdMock.mockResolvedValue({
        ...mockWorkOrder,
        status: 'IN_PROGRESS',
      });

      const start = new Date('2026-10-10T10:00:00Z');
      const end = new Date('2026-10-10T12:00:00Z');

      await expect(
        service.assign(tenant, 'wo-1', {
          assignedTechnicianId: 'tech-1',
          scheduledStart: start,
          scheduledEnd: end,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects create when scheduled start is after or equal to end', async () => {
      const start = new Date('2026-10-10T12:00:00Z');
      const end = new Date('2026-10-10T11:00:00Z');

      await expect(
        service.create(tenant, 'creator-1', {
          title: 'Test WO',
          description: 'Test Desc',
          siteName: 'Site A',
          scheduledStart: start,
          scheduledEnd: end,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects create when only scheduled start is provided', async () => {
      const start = new Date('2026-10-10T12:00:00Z');

      await expect(
        service.create(tenant, 'creator-1', {
          title: 'Test WO',
          description: 'Test Desc',
          siteName: 'Site A',
          scheduledStart: start,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('allows create when valid scheduled window is provided without technician', async () => {
      createWorkOrderMock.mockResolvedValue(mockWorkOrder);
      const start = new Date('2026-10-10T10:00:00Z');
      const end = new Date('2026-10-10T12:00:00Z');

      const result = await service.create(tenant, 'creator-1', {
        title: 'Test WO',
        description: 'Test Desc',
        siteName: 'Site A',
        scheduledStart: start,
        scheduledEnd: end,
      });

      expect(result).toBeDefined();
      expect(createWorkOrderMock).toHaveBeenCalled();
    });

    it('enqueues outbox notification atomically when work order is created with assigned technician', async () => {
      getUserByIdMock.mockResolvedValue({
        id: 'tech-1',
        name: 'Rahul Sharma',
        role: 'TECHNICIAN',
        organisationId: tenant.organisationId,
      });

      const start = new Date(Date.now() + 60 * 60 * 1000);
      const end = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const createdWithTech = {
        ...mockWorkOrder,
        id: 'wo-new-1',
        assignedTechnicianId: 'tech-1',
        scheduledStart: start,
        scheduledEnd: end,
        status: 'SCHEDULED' as const,
      };
      createWorkOrderMock.mockResolvedValue(createdWithTech);

      const result = await service.create(tenant, 'creator-1', {
        title: 'New AC Order',
        description: 'New Description',
        siteName: 'Site B',
        assignedTechnicianId: 'tech-1',
        scheduledStart: start,
        scheduledEnd: end,
      });

      expect(result).toEqual(createdWithTech);
      expect(createWorkOrderMock).toHaveBeenCalledWith(
        tenant.organisationId,
        expect.objectContaining({
          assignedTechnicianId: 'tech-1',
        }),
        expect.anything(),
      );
      expect(enqueueInTransactionMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          organisationId: tenant.organisationId,
          workOrderId: 'wo-new-1',
          recipientId: 'tech-1',
          channel: 'SMS',
          payload: expect.objectContaining({
            technicianName: 'Rahul Sharma',
            title: createdWithTech.title,
          }) as unknown,
        }),
      );
    });

    it('rejects create when scheduled start is in the past', async () => {
      const pastStart = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
      const pastEnd = new Date(Date.now() - 23 * 60 * 60 * 1000);

      await expect(
        service.create(tenant, 'creator-1', {
          title: 'Test WO',
          description: 'Test Desc',
          siteName: 'Site A',
          scheduledStart: pastStart,
          scheduledEnd: pastEnd,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects assign when scheduled start is in the past', async () => {
      findWorkOrderByIdMock.mockResolvedValue(mockWorkOrder);
      const pastStart = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
      const futureEnd = new Date(Date.now() + 60 * 60 * 1000);

      await expect(
        service.assign(tenant, 'wo-1', {
          assignedTechnicianId: 'tech-1',
          scheduledStart: pastStart,
          scheduledEnd: futureEnd,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('enqueues outbox notification atomically inside transaction on successful assignment', async () => {
      findWorkOrderByIdMock.mockResolvedValue(mockWorkOrder);
      getUserByIdMock.mockResolvedValue({
        id: 'tech-1',
        name: 'Rahul Sharma',
        role: 'TECHNICIAN',
        organisationId: tenant.organisationId,
      });

      const start = new Date(Date.now() + 60 * 60 * 1000);
      const end = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const updatedMock = {
        ...mockWorkOrder,
        assignedTechnicianId: 'tech-1',
        scheduledStart: start,
        scheduledEnd: end,
        status: 'SCHEDULED' as const,
      };
      updateAssignmentMock.mockResolvedValue(updatedMock);

      const result = await service.assign(tenant, 'wo-1', {
        assignedTechnicianId: 'tech-1',
        scheduledStart: start,
        scheduledEnd: end,
      });

      expect(result).toEqual(updatedMock);
      expect(updateAssignmentMock).toHaveBeenCalled();
      expect(enqueueInTransactionMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          organisationId: tenant.organisationId,
          workOrderId: 'wo-1',
          recipientId: 'tech-1',
          channel: 'SMS',
          payload: expect.objectContaining({
            technicianName: 'Rahul Sharma',
            title: mockWorkOrder.title,
          }) as unknown,
        }),
      );

      expect(mockRealtime.broadcastToOrganisation).toHaveBeenCalledWith(
        tenant.organisationId,
        expect.objectContaining({
          type: 'WORK_ORDER_ASSIGNED',
          workOrderId: 'wo-1',
          assignedTechnicianId: 'tech-1',
        }),
      );
    });

    it('broadcasts WORK_ORDER_UNASSIGNED to the previous technician when reassigned', async () => {
      findWorkOrderByIdMock.mockResolvedValue({
        ...mockWorkOrder,
        assignedTechnicianId: 'tech-1',
        status: 'SCHEDULED',
      });
      getUserByIdMock.mockResolvedValue({
        id: 'tech-2',
        name: 'Amit Patel',
        role: 'TECHNICIAN',
      });

      const start = new Date(Date.now() + 60 * 60 * 1000);
      const end = new Date(Date.now() + 120 * 60 * 1000);
      const reassignedMock = {
        ...mockWorkOrder,
        assignedTechnicianId: 'tech-2',
        scheduledStart: start,
        scheduledEnd: end,
        status: 'SCHEDULED',
      };
      updateAssignmentMock.mockResolvedValue(reassignedMock);

      await service.assign(tenant, 'wo-1', {
        assignedTechnicianId: 'tech-2',
        scheduledStart: start,
        scheduledEnd: end,
      });

      // 1. Must broadcast unassignment to the old technician
      expect(mockRealtime.broadcastToOrganisation).toHaveBeenCalledWith(
        tenant.organisationId,
        expect.objectContaining({
          type: 'WORK_ORDER_UNASSIGNED',
          workOrderId: 'wo-1',
          reference: mockWorkOrder.reference,
          assignedTechnicianId: 'tech-1',
        }),
      );

      // 2. Must broadcast assignment to the new technician
      expect(mockRealtime.broadcastToOrganisation).toHaveBeenCalledWith(
        tenant.organisationId,
        expect.objectContaining({
          type: 'WORK_ORDER_ASSIGNED',
          workOrderId: 'wo-1',
          reference: mockWorkOrder.reference,
          assignedTechnicianId: 'tech-2',
        }),
      );
    });
  });

  describe('Status Transitions', () => {
    it('prevents invalid transition from DRAFT directly to COMPLETED', async () => {
      findWorkOrderByIdMock.mockResolvedValue(mockWorkOrder);

      await expect(
        service.updateStatus(
          tenant,
          'wo-1',
          { status: 'COMPLETED' },
          'OWNER',
          'owner-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('forbids technician from cancelling a work order', async () => {
      findWorkOrderByIdMock.mockResolvedValue({
        ...mockWorkOrder,
        status: 'SCHEDULED',
        assignedTechnicianId: 'tech-1',
      });

      await expect(
        service.updateStatus(
          tenant,
          'wo-1',
          { status: 'CANCELLED' },
          'TECHNICIAN',
          'tech-1',
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows assigned technician to progress from SCHEDULED to IN_PROGRESS', async () => {
      findWorkOrderByIdMock.mockResolvedValue({
        ...mockWorkOrder,
        status: 'SCHEDULED',
        assignedTechnicianId: 'tech-1',
      });
      updateStatusMock.mockResolvedValue({
        ...mockWorkOrder,
        status: 'IN_PROGRESS',
        assignedTechnicianId: 'tech-1',
      });

      const result = await service.updateStatus(
        tenant,
        'wo-1',
        { status: 'IN_PROGRESS' },
        'TECHNICIAN',
        'tech-1',
      );

      expect(result.status).toBe('IN_PROGRESS');
      expect(updateStatusMock).toHaveBeenCalledWith(
        tenant.organisationId,
        'wo-1',
        { status: 'IN_PROGRESS' },
      );
    });
  });

  describe('Progress Events & Idempotency', () => {
    const sampleEventInput = {
      eventId: 'evt-10001',
      type: 'STATUS_CHANGED' as const,
      occurredAt: new Date('2026-08-04T10:30:00Z'),
      payload: { status: 'in_progress', note: 'Technician on site' },
    };

    it('returns existing event when eventId was already processed for this tenant (idempotent)', async () => {
      const existingSummary = {
        id: 'event-uuid-1',
        eventId: 'evt-10001',
        organisationId: tenant.organisationId,
        workOrderId: 'wo-1',
        userId: 'tech-1',
        userName: 'Rahul',
        userRole: 'TECHNICIAN',
        type: 'STATUS_CHANGED' as const,
        occurredAt: new Date('2026-08-04T10:30:00Z'),
        payload: { status: 'in_progress', note: 'Technician on site' },
        createdAt: new Date('2026-08-04T10:30:01Z'),
      };
      findByEventIdMock.mockResolvedValue(existingSummary);
      findWorkOrderByIdMock.mockResolvedValue({
        ...mockWorkOrder,
        id: 'wo-1',
        assignedTechnicianId: 'tech-1',
      });

      const result = await service.submitProgressEvent(
        tenant,
        'wo-1',
        sampleEventInput,
        'TECHNICIAN',
        'tech-1',
      );

      expect(result).toEqual(existingSummary);
      expect(recordEventWithWorkOrderLockMock).not.toHaveBeenCalled();
    });

    it('rejects technician replaying duplicate event on work order not assigned to them', async () => {
      const existingSummary = {
        id: 'evt-existing-uuid',
        eventId: 'evt-10001',
        organisationId: tenant.organisationId,
        workOrderId: 'wo-1',
        userId: 'tech-original',
        userName: 'Rahul',
        userRole: 'TECHNICIAN',
        type: 'STATUS_CHANGED' as const,
        occurredAt: new Date('2026-08-04T10:30:00Z'),
        payload: { status: 'in_progress', note: 'Technician on site' },
        createdAt: new Date('2026-08-04T10:30:01Z'),
      };
      findByEventIdMock.mockResolvedValue(existingSummary);
      findWorkOrderByIdMock.mockResolvedValue({
        ...mockWorkOrder,
        id: 'wo-1',
        assignedTechnicianId: 'tech-other',
      });

      await expect(
        service.submitProgressEvent(
          tenant,
          'wo-1',
          sampleEventInput,
          'TECHNICIAN',
          'tech-attacker',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects duplicate eventId when associated with a different work order', async () => {
      findByEventIdMock.mockResolvedValue({
        id: 'event-uuid-1',
        eventId: 'evt-10001',
        organisationId: tenant.organisationId,
        workOrderId: 'wo-DIFFERENT',
      });

      await expect(
        service.submitProgressEvent(
          tenant,
          'wo-1',
          sampleEventInput,
          'TECHNICIAN',
          'tech-1',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects technician attempting to submit progress event on unassigned work order', async () => {
      findByEventIdMock.mockResolvedValue(null);
      recordEventWithWorkOrderLockMock.mockImplementation(
        (
          _orgId: string,
          _woId: string,
          _uId: string,
          _inp: unknown,
          validator: (locked: {
            id: string;
            status: string;
            assignedTechnicianId: string | null;
            createdAt: Date;
          }) => string | null,
        ) => {
          validator({
            id: 'wo-1',
            status: 'SCHEDULED',
            assignedTechnicianId: 'tech-SOMEONE-ELSE',
            createdAt: new Date('2026-08-01T00:00:00Z'),
          });
          return Promise.resolve(null);
        },
      );

      await expect(
        service.submitProgressEvent(
          tenant,
          'wo-1',
          sampleEventInput,
          'TECHNICIAN',
          'tech-1',
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('executes atomic status transition and creates event record under lock', async () => {
      findByEventIdMock.mockResolvedValue(null);

      const createdEvent = {
        id: 'evt-new-uuid',
        eventId: 'evt-10001',
        organisationId: tenant.organisationId,
        workOrderId: 'wo-1',
        userId: 'tech-1',
        userName: 'Rahul',
        userRole: 'TECHNICIAN',
        type: 'STATUS_CHANGED' as const,
        occurredAt: sampleEventInput.occurredAt,
        payload: sampleEventInput.payload,
        createdAt: new Date(),
      };
      recordEventWithWorkOrderLockMock.mockImplementation(
        (
          _orgId: string,
          _woId: string,
          _uId: string,
          _inp: unknown,
          validator: (locked: {
            id: string;
            status: string;
            assignedTechnicianId: string | null;
            createdAt: Date;
          }) => string | null,
        ) => {
          const next = validator({
            id: 'wo-1',
            status: 'SCHEDULED',
            assignedTechnicianId: 'tech-1',
            createdAt: new Date('2026-08-01T00:00:00Z'),
          });
          expect(next).toBe('IN_PROGRESS');
          return Promise.resolve(createdEvent);
        },
      );

      const result = await service.submitProgressEvent(
        tenant,
        'wo-1',
        sampleEventInput,
        'TECHNICIAN',
        'tech-1',
      );

      expect(result).toEqual(createdEvent);
      expect(recordEventWithWorkOrderLockMock).toHaveBeenCalled();
    });

    it('rejects events with timestamps in the far future', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour in future
      await expect(
        service.submitProgressEvent(
          tenant,
          'wo-1',
          { ...sampleEventInput, occurredAt: futureDate },
          'TECHNICIAN',
          'tech-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('lists events for a permitted technician', async () => {
      findWorkOrderByIdMock.mockResolvedValue({
        ...mockWorkOrder,
        assignedTechnicianId: 'tech-1',
      });
      listByWorkOrderIdMock.mockResolvedValue([
        {
          id: 'evt-1',
          eventId: 'evt-10001',
          type: 'STATUS_CHANGED',
        },
      ]);

      const events = await service.listEvents(
        tenant,
        'wo-1',
        'TECHNICIAN',
        'tech-1',
      );
      expect(events).toHaveLength(1);
      expect(listByWorkOrderIdMock).toHaveBeenCalledWith(
        tenant.organisationId,
        'wo-1',
      );
    });
  });

  describe('CSV Export', () => {
    it('streams RFC 4180 CSV with sanitized formula cells and role scoping', async () => {
      const writtenChunks: string[] = [];
      const endMock = jest.fn();
      const mockResponse = {
        write: jest.fn((chunk: string) => writtenChunks.push(chunk)),
        end: endMock,
      } as unknown as Response;

      const dangerousWorkOrder: WorkOrderSummary = {
        ...mockWorkOrder,
        title: '=1+1 dangerous formula',
        description: '+SUM(A1:A5)',
        siteName: '-cmd|calc',
        scheduledStart: new Date('2026-08-04T10:00:00.000Z'),
        scheduledEnd: new Date('2026-08-04T12:00:00.000Z'),
        createdAt: new Date('2026-08-01T09:00:00.000Z'),
        updatedAt: new Date('2026-08-01T09:00:00.000Z'),
      };

      streamByOrganisationMock.mockImplementation(
        async (
          _orgId: string,
          _filter: unknown,
          onBatch: (batch: WorkOrderSummary[]) => Promise<void>,
        ) => {
          await onBatch([dangerousWorkOrder]);
        },
      );

      await service.exportCsvStream(
        tenant,
        { search: 'test' },
        'OWNER',
        'owner-1',
        mockResponse,
      );

      // Verify CSV header row is written first
      expect(writtenChunks[0]).toContain(
        '"Reference","Title","Description","Priority","Status","Site Name","Assigned Technician"',
      );

      // Verify formula cells are sanitized with leading single quote
      const dataRow = writtenChunks[1];
      expect(dataRow).toContain('"\'=1+1 dangerous formula"');
      expect(dataRow).toContain('"\' +SUM(A1:A5)"'.replace(' ', ''));
      expect(dataRow).toContain('"\'-cmd|calc"');

      // Verify response.end is called
      expect(endMock).toHaveBeenCalled();
    });

    it('enforces technician scoping during export', async () => {
      const mockResponse = {
        write: jest.fn(),
        end: jest.fn(),
      } as unknown as Response;

      streamByOrganisationMock.mockResolvedValue(undefined);

      await service.exportCsvStream(
        tenant,
        {},
        'TECHNICIAN',
        'tech-123',
        mockResponse,
      );

      expect(streamByOrganisationMock).toHaveBeenCalledWith(
        tenant.organisationId,
        expect.objectContaining({
          assignedTechnicianId: 'tech-123',
        }),
        expect.any(Function),
        100,
        expect.any(Function),
      );
    });
  });
});
