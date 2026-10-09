import { ForbiddenException, HttpStatus, NotFoundException } from '@nestjs/common';
import 'multer';

import type { StorageDriverPort } from '../../../infrastructure/storage/storage-driver.port';
import type { WorkOrderRepositoryPort } from '../../work-order/interfaces/work-order-repository.interface';
import type { WorkOrderSummary } from '../../work-order/interfaces/work-order.interface';
import type {
  AttachmentRepositoryPort,
  AttachmentSummary,
} from '../interfaces/attachment.interface';
import type { RealtimeService } from '../../realtime/services/realtime.service';
import { AttachmentService } from './attachment.service';

describe('AttachmentService', () => {
  let service: AttachmentService;

  let createAttachmentMock: jest.Mock;
  let findAttachmentByIdMock: jest.Mock;
  let listByWorkOrderMock: jest.Mock;
  let getOrganisationStorageUsageMock: jest.Mock;
  let deleteAttachmentMock: jest.Mock;
  let findByWorkOrderAndHashMock: jest.Mock;
  let findFirstByHashMock: jest.Mock;
  let countByStorageKeyMock: jest.Mock;

  let findWorkOrderByIdMock: jest.Mock;

  let saveFileMock: jest.Mock;
  let getStreamMock: jest.Mock;
  let deleteFileMock: jest.Mock;
  let existsFileMock: jest.Mock;

  let mockAttachmentRepo: AttachmentRepositoryPort;
  let mockWorkOrderRepo: WorkOrderRepositoryPort;
  let mockStorageDriver: StorageDriverPort;

  const tenantContext = { organisationId: 'org-1' };
  const validPdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

  const createMockWorkOrder = (overrides?: Partial<WorkOrderSummary>): WorkOrderSummary => ({
    id: 'wo-1',
    organisationId: 'org-1',
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
    ...overrides,
  });

  beforeEach(() => {
    createAttachmentMock = jest.fn();
    findAttachmentByIdMock = jest.fn();
    listByWorkOrderMock = jest.fn();
    getOrganisationStorageUsageMock = jest.fn();
    deleteAttachmentMock = jest.fn();
    findByWorkOrderAndHashMock = jest.fn().mockResolvedValue(null);
    findFirstByHashMock = jest.fn().mockResolvedValue(null);
    countByStorageKeyMock = jest.fn().mockResolvedValue(0);

    findWorkOrderByIdMock = jest.fn();

    saveFileMock = jest.fn();
    getStreamMock = jest.fn();
    deleteFileMock = jest.fn();
    existsFileMock = jest.fn();

    mockAttachmentRepo = {
      create: createAttachmentMock,
      findById: findAttachmentByIdMock,
      findByWorkOrderAndHash: findByWorkOrderAndHashMock,
      findFirstByHash: findFirstByHashMock,
      countByStorageKey: countByStorageKeyMock,
      listByWorkOrder: listByWorkOrderMock,
      getOrganisationStorageUsage: getOrganisationStorageUsageMock,
      delete: deleteAttachmentMock,
    };

    mockWorkOrderRepo = {
      findById: findWorkOrderByIdMock,
      listByOrganisation: jest.fn(),
      streamByOrganisation: jest.fn(),
      countByOrganisation: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateAssignment: jest.fn(),
      updateStatus: jest.fn(),
    };

    mockStorageDriver = {
      save: saveFileMock,
      getStream: getStreamMock,
      delete: deleteFileMock,
      exists: existsFileMock,
    };

    const mockRealtime = {
      broadcastToOrganisation: jest.fn().mockResolvedValue(undefined),
      createEventStream: jest.fn(),
    };

    service = new AttachmentService(
      mockAttachmentRepo,
      mockWorkOrderRepo,
      mockStorageDriver,
      mockRealtime as unknown as RealtimeService,
    );
  });

  describe('upload', () => {
    it('throws NotFoundException if work order does not exist', async () => {
      findWorkOrderByIdMock.mockResolvedValue(null);

      await expect(
        service.upload(tenantContext, {
          workOrderId: 'wo-1',
          uploaderId: 'user-1',
          userRole: 'DISPATCHER',
          file: {
            buffer: validPdfBuffer,
            originalname: 'spec.pdf',
          } as Express.Multer.File,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException if technician is not assigned to the work order', async () => {
      findWorkOrderByIdMock.mockResolvedValue(
        createMockWorkOrder({ assignedTechnicianId: 'other-tech' }),
      );

      await expect(
        service.upload(tenantContext, {
          workOrderId: 'wo-1',
          uploaderId: 'tech-1',
          userRole: 'TECHNICIAN',
          file: {
            buffer: validPdfBuffer,
            originalname: 'report.pdf',
          } as Express.Multer.File,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws 413 Payload Too Large if upload exceeds organisation quota', async () => {
      findWorkOrderByIdMock.mockResolvedValue(
        createMockWorkOrder({ assignedTechnicianId: 'tech-1' }),
      );

      getOrganisationStorageUsageMock.mockResolvedValue({
        usedBytes: BigInt(52428800),
        quotaBytes: BigInt(52428800),
      });

      await expect(
        service.upload(tenantContext, {
          workOrderId: 'wo-1',
          uploaderId: 'tech-1',
          userRole: 'TECHNICIAN',
          file: {
            buffer: validPdfBuffer,
            originalname: 'report.pdf',
          } as Express.Multer.File,
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.PAYLOAD_TOO_LARGE,
      });
    });

    it('successfully saves file, writes db record, and returns summary when quota permits', async () => {
      findWorkOrderByIdMock.mockResolvedValue(
        createMockWorkOrder({ assignedTechnicianId: 'tech-1' }),
      );

      getOrganisationStorageUsageMock.mockResolvedValue({
        usedBytes: BigInt(1000),
        quotaBytes: BigInt(52428800),
      });

      saveFileMock.mockResolvedValue({
        storageKey: 'random-uuid.pdf',
      });

      const fakeAttachment: AttachmentSummary = {
        id: 'att-1',
        organisationId: 'org-1',
        workOrderId: 'wo-1',
        uploaderId: 'tech-1',
        uploaderName: 'Tech One',
        originalFileName: 'report.pdf',
        mimeType: 'application/pdf',
        byteSize: validPdfBuffer.length,
        contentHash: 'a'.repeat(64),
        createdAt: new Date(),
      };

      createAttachmentMock.mockResolvedValue(fakeAttachment);

      const result = await service.upload(tenantContext, {
        workOrderId: 'wo-1',
        uploaderId: 'tech-1',
        userRole: 'TECHNICIAN',
        file: {
          buffer: validPdfBuffer,
          originalname: 'report.pdf',
        } as Express.Multer.File,
      });

      expect(result).toEqual(fakeAttachment);
      expect(saveFileMock).toHaveBeenCalled();
      expect(createAttachmentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          organisationId: 'org-1',
          workOrderId: 'wo-1',
          uploaderId: 'tech-1',
          storageKey: 'random-uuid.pdf',
          originalFileName: 'report.pdf',
          mimeType: 'application/pdf',
          byteSize: validPdfBuffer.length,
          contentHash: 'e16fa5d9b51928755db85b917f0297babaf22c7a47e97d9212adab56e61ba04e',
        }),
      );
    });

    it('throws 409 Conflict if same file is already uploaded to the same work order', async () => {
      findWorkOrderByIdMock.mockResolvedValue(
        createMockWorkOrder({ assignedTechnicianId: 'tech-1' }),
      );

      findByWorkOrderAndHashMock.mockResolvedValue({
        id: 'existing-att',
        originalFileName: 'already.pdf',
      });

      await expect(
        service.upload(tenantContext, {
          workOrderId: 'wo-1',
          uploaderId: 'tech-1',
          userRole: 'TECHNICIAN',
          file: {
            buffer: validPdfBuffer,
            originalname: 'already.pdf',
          } as Express.Multer.File,
        }),
      ).rejects.toMatchObject({
        status: HttpStatus.CONFLICT,
        message: 'This file has already been uploaded to this work order',
      });

      expect(saveFileMock).not.toHaveBeenCalled();
      expect(createAttachmentMock).not.toHaveBeenCalled();
    });

    it('reuses existing storageKey and skips saving new physical file when same content exists in another work order', async () => {
      findWorkOrderByIdMock.mockResolvedValue(
        createMockWorkOrder({ assignedTechnicianId: 'tech-1' }),
      );

      findByWorkOrderAndHashMock.mockResolvedValue(null);
      findFirstByHashMock.mockResolvedValue({
        id: 'att-other-wo',
        storageKey: 'shared-hash-key.pdf',
      });

      const fakeAttachment: AttachmentSummary = {
        id: 'att-2',
        organisationId: 'org-1',
        workOrderId: 'wo-1',
        uploaderId: 'tech-1',
        uploaderName: 'Tech One',
        originalFileName: 'report2.pdf',
        mimeType: 'application/pdf',
        byteSize: validPdfBuffer.length,
        contentHash: 'b'.repeat(64),
        createdAt: new Date(),
      };

      createAttachmentMock.mockResolvedValue(fakeAttachment);

      const result = await service.upload(tenantContext, {
        workOrderId: 'wo-1',
        uploaderId: 'tech-1',
        userRole: 'TECHNICIAN',
        file: {
          buffer: validPdfBuffer,
          originalname: 'report2.pdf',
        } as Express.Multer.File,
      });

      expect(result).toEqual(fakeAttachment);
      expect(saveFileMock).not.toHaveBeenCalled();
      expect(getOrganisationStorageUsageMock).not.toHaveBeenCalled();
      expect(createAttachmentMock).toHaveBeenCalledWith(
        expect.objectContaining({
          storageKey: 'shared-hash-key.pdf',
          workOrderId: 'wo-1',
        }),
      );
    });

    it('cleans up saved file from disk if database insertion fails', async () => {
      findWorkOrderByIdMock.mockResolvedValue(
        createMockWorkOrder({ assignedTechnicianId: 'tech-1' }),
      );

      getOrganisationStorageUsageMock.mockResolvedValue({
        usedBytes: BigInt(1000),
        quotaBytes: BigInt(52428800),
      });

      saveFileMock.mockResolvedValue({
        storageKey: 'orphaned-file.pdf',
      });

      createAttachmentMock.mockRejectedValue(new Error('DB connection dropped'));

      await expect(
        service.upload(tenantContext, {
          workOrderId: 'wo-1',
          uploaderId: 'tech-1',
          userRole: 'TECHNICIAN',
          file: {
            buffer: validPdfBuffer,
            originalname: 'report.pdf',
          } as Express.Multer.File,
        }),
      ).rejects.toThrow('DB connection dropped');

      expect(deleteFileMock).toHaveBeenCalledWith('orphaned-file.pdf');
    });
  });

  describe('delete', () => {
    it('throws ForbiddenException if non-owner technician attempts to delete someone elses upload', async () => {
      findWorkOrderByIdMock.mockResolvedValue(
        createMockWorkOrder({ assignedTechnicianId: 'tech-1' }),
      );

      findAttachmentByIdMock.mockResolvedValue({
        id: 'att-1',
        organisationId: 'org-1',
        workOrderId: 'wo-1',
        uploaderId: 'different-user',
        uploaderName: 'Diff',
        originalFileName: 'spec.pdf',
        mimeType: 'application/pdf',
        byteSize: 100,
        createdAt: new Date(),
        storageKey: 'key-1.pdf',
      });

      await expect(
        service.delete(tenantContext, 'wo-1', 'att-1', 'TECHNICIAN', 'tech-1'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows OWNER to delete attachment and deletes physical file when reference count is 0', async () => {
      findWorkOrderByIdMock.mockResolvedValue(createMockWorkOrder());

      findAttachmentByIdMock.mockResolvedValue({
        id: 'att-1',
        organisationId: 'org-1',
        workOrderId: 'wo-1',
        uploaderId: 'different-user',
        uploaderName: 'Diff',
        originalFileName: 'spec.pdf',
        mimeType: 'application/pdf',
        byteSize: 100,
        createdAt: new Date(),
        storageKey: 'key-1.pdf',
      });

      deleteAttachmentMock.mockResolvedValue({
        id: 'att-1',
        organisationId: 'org-1',
        workOrderId: 'wo-1',
        uploaderId: 'different-user',
        uploaderName: 'Diff',
        originalFileName: 'spec.pdf',
        mimeType: 'application/pdf',
        byteSize: 100,
        createdAt: new Date(),
        storageKey: 'key-1.pdf',
      });

      countByStorageKeyMock.mockResolvedValue(0);

      await service.delete(tenantContext, 'wo-1', 'att-1', 'OWNER', 'owner-1');

      expect(deleteAttachmentMock).toHaveBeenCalledWith('org-1', 'wo-1', 'att-1');
      expect(countByStorageKeyMock).toHaveBeenCalledWith('key-1.pdf');
      expect(deleteFileMock).toHaveBeenCalledWith('key-1.pdf');
    });

    it('retains physical file when other records still reference the storageKey', async () => {
      findWorkOrderByIdMock.mockResolvedValue(createMockWorkOrder());

      findAttachmentByIdMock.mockResolvedValue({
        id: 'att-1',
        organisationId: 'org-1',
        workOrderId: 'wo-1',
        uploaderId: 'owner-1',
        storageKey: 'shared-key.pdf',
      });

      deleteAttachmentMock.mockResolvedValue({
        id: 'att-1',
        storageKey: 'shared-key.pdf',
      });

      countByStorageKeyMock.mockResolvedValue(1);

      await service.delete(tenantContext, 'wo-1', 'att-1', 'OWNER', 'owner-1');

      expect(deleteAttachmentMock).toHaveBeenCalledWith('org-1', 'wo-1', 'att-1');
      expect(countByStorageKeyMock).toHaveBeenCalledWith('shared-key.pdf');
      expect(deleteFileMock).not.toHaveBeenCalled();
    });
  });
});
