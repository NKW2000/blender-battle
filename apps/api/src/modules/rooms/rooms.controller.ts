import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { ApiErrorCode, SUBMISSION_MODEL_MAX_BYTES } from '@bb/shared';
import { IsOptional, IsString, IsUUID, Length } from 'class-validator';

import { CurrentUser } from '@/common/decorators';
import { AppException } from '@/common/exceptions/app.exception';
import { ResponseMessage } from '@/common/interceptors/response.interceptor';
import type { AuthenticatedUser } from '@/common/types/authenticated-user';
import { CloudinaryService } from '@/modules/uploads/cloudinary.service';

import { BallotService } from './ballot.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { RoomMapper } from './rooms.mapper';
import { RoomsService } from './rooms.service';

class JoinRoomDto {
  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsOptional()
  @IsString()
  @Length(4, 12)
  code?: string;
}

@Controller('rooms')
export class RoomsController {
  constructor(
    private readonly rooms: RoomsService,
    private readonly uploads: CloudinaryService,
    private readonly ballots: BallotService,
  ) {}

  /** The room this player is already in, so a reload lands back in it. */
  @Get('active')
  async active(@CurrentUser() user: AuthenticatedUser) {
    const room = await this.rooms.findActiveForUser(user.id);
    return room ? RoomMapper.summary(room) : null;
  }

  @Get(':id')
  async detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const room = await this.rooms.findOrFail(id);
    return RoomMapper.detail(room, user.id);
  }

  // Room creation is cheap to spam and each one is publicly listed, so it is
  // rate limited harder than an ordinary write.
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ResponseMessage('Room created')
  async create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRoomDto) {
    const room = await this.rooms.create(user, dto);
    return RoomMapper.detail(room, user.id);
  }

  @Post('join')
  @ResponseMessage('Joined')
  async join(@CurrentUser() user: AuthenticatedUser, @Body() dto: JoinRoomDto) {
    const room = await this.rooms.join(user, dto);
    return RoomMapper.detail(room, user.id);
  }

  @Delete(':id/leave')
  @HttpCode(HttpStatus.NO_CONTENT)
  async leave(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    await this.rooms.leave(id, user.id);
  }

  /**
   * Upload an entry: the render that goes on the ballot, plus the model file.
   *
   * Both files stream through the API rather than going browser-direct to
   * Cloudinary — an unsigned upload preset is a public write endpoint into the
   * account's storage, and the deadline has to be checked server-side anyway.
   */
  @Post(':id/submit')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'image', maxCount: 1 },
        { name: 'model', maxCount: 1 },
      ],
      { limits: { fileSize: SUBMISSION_MODEL_MAX_BYTES } },
    ),
  )
  @ResponseMessage('Entry submitted')
  async submit(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFiles()
    files: { image?: Express.Multer.File[]; model?: Express.Multer.File[] },
    @Body() body: { notes?: string },
  ) {
    /*
      Authorisation before file handling.

      Checked first so an outsider or a closed room gets a clean 403/409 rather
      than a 500 from the upload path, and so no bytes are stored for a request
      that was never going to be accepted.
    */
    const room = await this.rooms.assertOpenForSubmission(id, user.id);

    // `files` is undefined entirely when the request was not multipart, which a
    // plain `files.image` would turn into a TypeError and a 500.
    const image = files?.image?.[0];
    const model = files?.model?.[0];

    if (!image) {
      throw new AppException(
        ApiErrorCode.VALIDATION_FAILED,
        'A render image is required',
        400,
      );
    }

    const uploadedImage = await this.uploads.uploadSubmissionImage(image, room.id);
    const uploadedModel = model
      ? await this.uploads.uploadSubmissionModel(model, room.id)
      : null;

    const submission = await this.rooms.submit(
      id,
      user.id,
      {
        imageUrl: uploadedImage.url,
        modelUrl: uploadedModel?.url ?? null,
        modelFilename: uploadedModel?.filename ?? null,
      },
      body.notes,
    );

    return {
      id: submission.id,
      imageUrl: submission.imageUrl,
      modelFilename: submission.modelFilename,
      submittedAt: submission.submittedAt,
    };
  }

  /**
   * This voter's ballot: the entries, in their own order, with the deadlines.
   *
   * Their own work is not in the response at all — not hidden client-side, just
   * never sent.
   */
  @Get(':id/ballot')
  async ballot(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ballots.open(id, user.id);
  }

  @Post(':id/ballot/:submissionId/like')
  @HttpCode(HttpStatus.OK)
  async like(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ballots.like(id, user.id, submissionId, true);
  }

  /** Withdraw a like. In a runoff this is how a pick is moved elsewhere. */
  @Delete(':id/ballot/:submissionId/like')
  @HttpCode(HttpStatus.OK)
  async unlike(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('submissionId', ParseUUIDPipe) submissionId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.ballots.like(id, user.id, submissionId, false);
  }

  /**
   * Host starts the room. The brief is drawn server-side in this call — it does
   * not exist until now, and nobody, including the host, has seen it.
   */
  @Post(':id/start')
  @ResponseMessage('Room started')
  async start(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const room = await this.rooms.start(id, user.id);
    return RoomMapper.detail(room, user.id);
  }
}
