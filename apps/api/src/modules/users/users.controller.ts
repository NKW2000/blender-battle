import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  AVATAR_MAX_BYTES,
  Role,
  type AdminUserListItem,
  type CursorPage,
  type PortfolioItem,
  type PublicUserProfile,
  type SelfUserProfile,
} from '@bb/shared';
import type { Request } from 'express';

import { CurrentUser, Public, Roles } from '@/common/decorators';
import { ResponseMessage } from '@/common/interceptors/response.interceptor';

import {
  ListUsersQueryDto,
  UpdateUserRoleDto,
  UpdateUserStatusDto,
} from './dto/admin-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  async me(@CurrentUser('id') userId: string): Promise<SelfUserProfile> {
    return this.users.getSelf(userId);
  }

  @Patch('me')
  @ResponseMessage('Profile updated')
  async updateMe(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
    @Req() req: Request,
  ): Promise<SelfUserProfile> {
    return this.users.updateProfile(userId, dto, {
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
  }

  /**
   * Memory storage with a hard size limit: the buffer is streamed straight to
   * Cloudinary, so nothing untrusted is ever written to the API's own filesystem.
   */
  @Post('me/avatar')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: AVATAR_MAX_BYTES, files: 1 },
    }),
  )
  @ResponseMessage('Avatar updated')
  async uploadAvatar(
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<SelfUserProfile> {
    return this.users.updateAvatar(userId, file);
  }

  /** Public profile. Declared last among GETs so /users/me is not shadowed. */
  @Public()
  @Get('by-username/:username')
  async publicProfile(@Param('username') username: string): Promise<PublicUserProfile> {
    return this.users.getPublicProfile(username);
  }

  /** The artist's finished work. Resolved challenges only — see the service. */
  @Public()
  @Get('by-username/:username/portfolio')
  async portfolio(@Param('username') username: string): Promise<PortfolioItem[]> {
    return this.users.getPortfolio(username);
  }

  // --- Admin ---------------------------------------------------------------

  @Roles(Role.ADMIN)
  @Get()
  async list(@Query() query: ListUsersQueryDto): Promise<CursorPage<AdminUserListItem>> {
    return this.users.listForAdmin(query);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/role')
  @ResponseMessage('Role updated')
  async changeRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser('id') actorId: string,
  ): Promise<AdminUserListItem> {
    return this.users.changeRole(id, dto.role, dto.reason, actorId);
  }

  @Roles(Role.ADMIN)
  @Patch(':id/status')
  @ResponseMessage('Status updated')
  async changeStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
    @CurrentUser('id') actorId: string,
  ): Promise<AdminUserListItem> {
    return this.users.changeStatus(id, dto.status, dto.reason, actorId, dto.suspendedUntil);
  }
}
