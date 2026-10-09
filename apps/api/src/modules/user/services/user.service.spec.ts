import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';

import { USER_REPOSITORY } from '../interfaces/user-repository.interface';
import type { UserRepositoryPort } from '../interfaces/user-repository.interface';
import type { UserModel } from '../interfaces/user.interface';
import { UserService } from './user.service';

describe('UserService', () => {
  let findByIdMock: jest.Mock;
  let findByEmailMock: jest.Mock;
  let listByOrganisationMock: jest.Mock;
  let createMock: jest.Mock;
  let updateMock: jest.Mock;
  let updateRoleAndRevokeSessionsMock: jest.Mock;
  let countOwnersMock: jest.Mock;

  let repository: UserRepositoryPort;
  let module: TestingModule;
  let service: UserService;

  beforeEach(async () => {
    findByIdMock = jest.fn();
    findByEmailMock = jest.fn();
    listByOrganisationMock = jest.fn();
    createMock = jest.fn();
    updateMock = jest.fn();
    updateRoleAndRevokeSessionsMock = jest.fn();
    countOwnersMock = jest.fn();

    repository = {
      findById: findByIdMock,
      findByEmail: findByEmailMock,
      listByOrganisation: listByOrganisationMock,
      create: createMock,
      update: updateMock,
      updateRoleAndRevokeSessions: updateRoleAndRevokeSessionsMock,
      countOwners: countOwnersMock,
    };

    module = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: USER_REPOSITORY, useValue: repository },
      ],
    }).compile();
    service = module.get(UserService);
  });

  afterEach(async () => {
    await module.close();
  });

  const tenant = { organisationId: '11111111-1111-1111-1111-111111111111' };

  it('normalizes email and hashes password on user creation', async () => {
    findByEmailMock.mockResolvedValue(null);
    const createdUser: UserModel = {
      id: '22222222-2222-2222-2222-222222222222',
      organisationId: tenant.organisationId,
      email: 'tech@company.com',
      name: 'Ravi Kumar',
      role: 'TECHNICIAN',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    createMock.mockResolvedValue(createdUser);

    const result = await service.create(tenant, {
      email: '  TECH@Company.COM ',
      name: '  Ravi Kumar  ',
      password: 'SecurePassword123',
      role: 'TECHNICIAN',
    });

    expect(result).toEqual(createdUser);
    expect(findByEmailMock).toHaveBeenCalledWith('tech@company.com');
    expect(createMock).toHaveBeenCalledWith(
      tenant.organisationId,
      expect.objectContaining({
        email: 'tech@company.com',
        name: 'Ravi Kumar',
        role: 'TECHNICIAN',
        passwordHash: expect.stringMatching(/^\$argon2id\$/) as string,
      }),
    );
  });

  it('rejects creation if email already exists', async () => {
    findByEmailMock.mockResolvedValue({
      id: 'existing-id',
      organisationId: tenant.organisationId,
      email: 'tech@company.com',
      name: 'Existing',
      role: 'TECHNICIAN',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(
      service.create(tenant, {
        email: 'tech@company.com',
        name: 'Ravi',
        password: 'Password123',
        role: 'TECHNICIAN',
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('delegates role change and session revocation to repository', async () => {
    const ownerUser: UserModel = {
      id: 'owner-id',
      organisationId: tenant.organisationId,
      email: 'owner@company.com',
      name: 'Owner',
      role: 'OWNER',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    findByIdMock.mockResolvedValue(ownerUser);
    updateRoleAndRevokeSessionsMock.mockResolvedValue({
      ...ownerUser,
      role: 'DISPATCHER',
    });

    const result = await service.updateRole(tenant, 'owner-id', {
      role: 'DISPATCHER',
    });

    expect(result.role).toBe('DISPATCHER');
    expect(updateRoleAndRevokeSessionsMock).toHaveBeenCalledWith(
      tenant.organisationId,
      'owner-id',
      'DISPATCHER',
    );
  });

  it('throws NotFoundException when user does not exist in tenant', async () => {
    findByIdMock.mockResolvedValue(null);

    await expect(
      service.getById(tenant, 'non-existent-or-foreign-id'),
    ).rejects.toThrow(NotFoundException);
  });
});
