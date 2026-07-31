import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
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
import { Throttle } from '@nestjs/throttler';
import {
  CHALLENGE_ASSET_MAX_BYTES,
  ChallengeAssetType,
  Role,
  type CategorySummary,
  type ChallengeDetail,
  type ChallengeSummary,
  type CursorPage,
  type TagSummary,
} from '@bb/shared';
import { IsEnum } from 'class-validator';
import type { Request } from 'express';

import { CurrentUser, OptionalAuth, Public, Roles } from '@/common/decorators';
import { ResponseMessage } from '@/common/interceptors/response.interceptor';
import type { AuthenticatedUser } from '@/common/types/authenticated-user';

import { ChallengeAssetsService } from './challenge-assets.service';
import { ChallengeMapper } from './challenges.mapper';
import { ChallengesService } from './challenges.service';
import {
  CreateChallengeDto,
  DrawChallengeDto,
  ListChallengesQueryDto,
  UpdateChallengeDto,
} from './dto/challenge.dto';

class AddAssetDto {
  @IsEnum(ChallengeAssetType)
  type: ChallengeAssetType;
}

@Controller('challenges')
export class ChallengesController {
  constructor(
    private readonly challenges: ChallengesService,
    private readonly assets: ChallengeAssetsService,
  ) {}

  /**
   * Public browse. The route is public, but the service still narrows results by
   * whoever the caller turns out to be — an anonymous visitor and a signed-in
   * manager get different rows from the same URL.
   */
  @OptionalAuth()
  @Get()
  async list(
    @Query() query: ListChallengesQueryDto,
    @Req() req: Request,
  ): Promise<CursorPage<ChallengeSummary>> {
    return this.challenges.list(query, this.viewerOf(req));
  }

  @Public()
  @Get('categories')
  async categories(): Promise<CategorySummary[]> {
    const categories = await this.challenges.listCategories();
    return categories.map((category) => ChallengeMapper.category(category));
  }

  @Public()
  @Get('tags')
  async tags(): Promise<TagSummary[]> {
    const tags = await this.challenges.listTags();
    return tags.map(ChallengeMapper.tag);
  }

  /**
   * The random draw. Authenticated because it is the first step of a battle and
   * it writes an audit record naming the player who drew.
   *
   * Throttled tightly: without a limit a client could re-roll until it got the
   * brief it wanted, which is the same attack the endpoint exists to prevent.
   */
  @Post('draw')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ResponseMessage('Challenge drawn')
  async draw(
    @Body() dto: DrawChallengeDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ChallengeDetail> {
    return this.challenges.draw(dto, user);
  }

  @OptionalAuth()
  @Get(':slug')
  async detail(@Param('slug') slug: string, @Req() req: Request): Promise<ChallengeDetail> {
    return this.challenges.findBySlug(slug, this.viewerOf(req));
  }

  // --- Manager -------------------------------------------------------------

  @Roles(Role.MANAGER)
  @Post()
  @ResponseMessage('Challenge created')
  async create(
    @Body() dto: CreateChallengeDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ChallengeDetail> {
    return this.challenges.create(dto, user);
  }

  @Roles(Role.MANAGER)
  @Patch(':id')
  @ResponseMessage('Challenge saved')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateChallengeDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ChallengeDetail> {
    return this.challenges.update(id, dto, user);
  }

  @Roles(Role.MANAGER)
  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Challenge published')
  async publish(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ChallengeDetail> {
    return this.challenges.publish(id, user);
  }

  @Roles(Role.MANAGER)
  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Challenge archived')
  async archive(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ChallengeDetail> {
    return this.challenges.archive(id, user);
  }

  @Roles(Role.MANAGER)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.challenges.remove(id, user);
  }

  @Roles(Role.MANAGER)
  @Post(':id/assets')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: CHALLENGE_ASSET_MAX_BYTES, files: 1 } }),
  )
  @ResponseMessage('Attachment added')
  async addAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddAssetDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ChallengeDetail> {
    return this.assets.add(id, file, dto.type, user);
  }

  @Roles(Role.MANAGER)
  @Delete(':id/assets/:assetId')
  @ResponseMessage('Attachment removed')
  async removeAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ChallengeDetail> {
    return this.assets.remove(id, assetId, user);
  }

  /** Present on public routes only when a valid token happened to be sent. */
  private viewerOf(req: Request): AuthenticatedUser | null {
    return (req as Request & { user?: AuthenticatedUser }).user ?? null;
  }
}
