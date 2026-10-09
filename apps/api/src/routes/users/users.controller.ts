import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import {
  CurrentIdentity,
  RequirePermission,
} from '../../http/decorators/auth.decorators';
import type { Identity } from '../../modules/auth/interfaces/auth-identity.interface';
import { UserService } from '../../modules/user/services/user.service';
import { CreateUserDto } from './dtos/create-user.dto';
import { ListUsersQueryDto } from './dtos/list-users-query.dto';
import { UpdateUserRoleDto } from './dtos/update-user-role.dto';
import { UpdateUserDto } from './dtos/update-user.dto';
import { UserListResDto } from './dtos/user-list-res.dto';
import { UserResDto } from './dtos/user-res.dto';

@ApiTags('Users')
@ApiCookieAuth('session')
@Controller('api/v1/users')
export class UsersController {
  constructor(private readonly users: UserService) {}

  @Get()
  @RequirePermission(['users:manage', 'work:manage'])
  @ApiOperation({ summary: 'List organisation users' })
  @ApiResponse({ status: 200, type: UserListResDto })
  async list(
    @CurrentIdentity() identity: Identity,
    @Query() query: ListUsersQueryDto,
  ): Promise<UserListResDto> {
    const context = { organisationId: identity.organisation.id };
    const result = await this.users.list(
      context,
      { role: query.role, search: query.search },
      { page: query.page, limit: query.limit },
    );
    return UserListResDto.fromData(result);
  }

  @Post()
  @RequirePermission('users:manage')
  @ApiOperation({ summary: 'Create a new user in the organisation' })
  @ApiResponse({ status: 201, type: UserResDto })
  async create(
    @CurrentIdentity() identity: Identity,
    @Body() dto: CreateUserDto,
  ): Promise<UserResDto> {
    const context = { organisationId: identity.organisation.id };
    const user = await this.users.create(context, {
      email: dto.email,
      name: dto.name,
      password: dto.password,
      role: dto.role,
    });
    return UserResDto.fromData(user);
  }

  @Get(':id')
  @RequirePermission('users:manage')
  @ApiOperation({ summary: 'Get user details by ID' })
  @ApiResponse({ status: 200, type: UserResDto })
  async getById(
    @CurrentIdentity() identity: Identity,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UserResDto> {
    const context = { organisationId: identity.organisation.id };
    const user = await this.users.getById(context, id);
    return UserResDto.fromData(user);
  }

  @Patch(':id')
  @RequirePermission('users:manage')
  @ApiOperation({ summary: 'Update user profile' })
  @ApiResponse({ status: 200, type: UserResDto })
  async update(
    @CurrentIdentity() identity: Identity,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResDto> {
    const context = { organisationId: identity.organisation.id };
    const user = await this.users.update(context, id, { name: dto.name });
    return UserResDto.fromData(user);
  }

  @Put(':id/role')
  @RequirePermission('users:manage')
  @ApiOperation({
    summary: 'Update user role and atomically revoke active sessions',
  })
  @ApiResponse({ status: 200, type: UserResDto })
  async updateRole(
    @CurrentIdentity() identity: Identity,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserRoleDto,
  ): Promise<UserResDto> {
    const context = { organisationId: identity.organisation.id };
    const user = await this.users.updateRole(context, id, { role: dto.role });
    return UserResDto.fromData(user);
  }
}
