import {
  Body,
  Controller,
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
import { ApiErrorCode, Role, SUBMISSION_MODEL_MAX_BYTES } from '@bb/shared';
import { IsDateString, IsInt, IsUUID, Max, Min } from 'class-validator';

import { CurrentUser, Public, Roles } from '@/common/decorators';
import { AppException } from '@/common/exceptions/app.exception';
import { ResponseMessage } from '@/common/interceptors/response.interceptor';
import type { AuthenticatedUser } from '@/common/types/authenticated-user';
import { CloudinaryService } from '@/modules/uploads/cloudinary.service';

import { ChallengeEventsService } from './challenge-events.service';
import { ChallengeMapper } from './challenges.mapper';
import type { Challenge } from './entities/challenge.entity';
import type { ChallengeEntry } from './entities/challenge-entry.entity';

class VoteDto {
  @IsUUID()
  entryId: string;
}

class ScheduleDto {
  /** ISO start time. Submissions open at this moment. */
  @IsDateString()
  startDate: string;

  /** Submission window length, in hours. The UI offers a days/hours unit. */
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  submitHours: number;

  /** Voting window length, in hours, beginning when submissions close. */
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  voteHours: number;
}

/**
 * Public, dated challenges: enter while open, vote for a winner once closed.
 *
 * Everything that decides whether an action is allowed comes from the two dates
 * on the challenge, evaluated server-side. The UI hides buttons to match, but
 * hiding a button is presentation — these guards are the rule.
 */
@Controller('challenge-events')
export class ChallengeEventsController {
  constructor(
    private readonly events: ChallengeEventsService,
    private readonly uploads: CloudinaryService,
  ) {}

  @Public()
  @Get()
  async list() {
    const challenges = await this.events.listEvents();
    return challenges.map((challenge) => this.toEvent(challenge));
  }

  @Get(':id')
  async detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const challenge = await this.events.findEventOrFail(id);
    const phase = this.events.phaseOf(challenge);
    const entries = await this.events.listEntries(id);

    return {
      ...this.toEvent(challenge),
      myEntryId: entries.find((entry) => entry.userId === user.id)?.id ?? null,
      myVoteEntryId: await this.events.myVote(id, user.id),
      /*
        What the viewer may see depends on the phase, and it is enforced here
        rather than trusted to the UI:

        - open / upcoming: nothing. Showing entries while the window is open would
          let a late entrant copy an early one.
        - voting: a blind ballot. The image only — no author, no vote count. A
          name or a running tally turns a judgement of the work into a popularity
          contest and lets voters pile onto the leader, so neither is sent at all.
        - finished: the full reveal. Authors and final counts, now that nothing
          about them can influence the vote.
      */
      entries:
        phase === 'open' || phase === 'upcoming'
          ? []
          : phase === 'voting'
            ? entries.map(toBlindEntry)
            : entries.map(toEntry),
    };
  }

  /**
   * Enter the challenge.
   *
   * The window is checked before the files are touched, so a late request costs
   * no storage and returns a clean 409 instead of failing somewhere in the
   * upload pipeline.
   */
  @Post(':id/entries')
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
  async enter(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFiles() files: { image?: Express.Multer.File[]; model?: Express.Multer.File[] },
    @Body() body: { notes?: string },
  ) {
    await this.events.assertOpenForEntry(id);

    // `files` is undefined entirely on a non-multipart request, which a plain
    // property read would turn into a 500.
    const image = files?.image?.[0];
    const model = files?.model?.[0];

    if (!image) {
      throw new AppException(ApiErrorCode.VALIDATION_FAILED, 'A render image is required', 400);
    }

    const uploadedImage = await this.uploads.uploadSubmissionImage(image, id);
    const uploadedModel = model ? await this.uploads.uploadSubmissionModel(model, id) : null;

    const entry = await this.events.submitEntry(
      id,
      user.id,
      {
        imageUrl: uploadedImage.url,
        modelUrl: uploadedModel?.url ?? null,
        modelFilename: uploadedModel?.filename ?? null,
      },
      body.notes,
    );

    return toEntry(entry);
  }

  /** Vote for the winner. One per person, movable until voting closes. */
  @Post(':id/vote')
  @HttpCode(HttpStatus.OK)
  @ResponseMessage('Vote counted')
  async vote(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: VoteDto,
  ) {
    return this.events.vote(id, user.id, dto.entryId);
  }

  /**
   * Schedule this challenge as a public event. Managers only.
   *
   * The submission and vote windows are given as lengths in hours; the two
   * deadlines are computed server-side so they can never be set out of order.
   */
  @Roles(Role.MANAGER, Role.ADMIN)
  @Post(':id/schedule')
  @ResponseMessage('Event scheduled')
  async schedule(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ScheduleDto) {
    const challenge = await this.events.schedule(id, {
      startDate: new Date(dto.startDate),
      submitHours: dto.submitHours,
      voteHours: dto.voteHours,
    });
    return this.toEvent(challenge);
  }

  /** Remove the schedule, returning the challenge to an ordinary brief. */
  @Roles(Role.MANAGER, Role.ADMIN)
  @Post(':id/unschedule')
  @ResponseMessage('Schedule cleared')
  async unschedule(@Param('id', ParseUUIDPipe) id: string) {
    const challenge = await this.events.unschedule(id);
    return this.toEvent(challenge);
  }

  /** Freeze the result. Managers only — it ends the event for everyone. */
  @Roles(Role.MANAGER, Role.ADMIN)
  @Post(':id/close')
  @ResponseMessage('Winner declared')
  async close(@Param('id', ParseUUIDPipe) id: string) {
    const challenge = await this.events.closeVoting(id);
    return this.toEvent(challenge);
  }

  private toEvent(challenge: Challenge) {
    const summary = ChallengeMapper.summary(challenge);
    return {
      ...summary,
      startDate: challenge.startDate?.toISOString() ?? null,
      endDate: challenge.endDate?.toISOString() ?? null,
      votingEndsAt: challenge.votingEndsAt?.toISOString() ?? null,
      winnerEntryId: challenge.winnerEntryId,
      phase: this.events.phaseOf(challenge),
      // The reference the entries are judged against, shown beside the ballot.
      // Reuses the cover image, which is already the first reference asset.
      referenceImageUrl: summary.coverImageUrl,
      // The judging criteria the manager wrote, so the reference panel lists what
      // this specific brief is scored on rather than a generic checklist.
      objectives: challenge.objectives ?? [],
      // Absolute dates plus server time, so a skewed client clock still computes
      // the same remaining window as everyone else.
      serverNow: new Date().toISOString(),
    };
  }
}

function toEntry(entry: ChallengeEntry) {
  return {
    id: entry.id,
    userId: entry.userId,
    username: entry.user?.username ?? null,
    imageUrl: entry.imageUrl,
    modelUrl: entry.modelUrl,
    modelFilename: entry.modelFilename,
    notes: entry.notes,
    voteCount: entry.voteCount,
    submittedAt: entry.submittedAt,
  };
}

/**
 * The blindfold shape, sent during the voting phase.
 *
 * Everything that could identify the artist or reveal the standings is dropped
 * on the server — not blanked in the client — so it cannot be recovered from the
 * network response. Only the id (to cast a vote against) and the image (to judge)
 * survive. `voteCount` is zeroed rather than omitted so the field's type is
 * stable across phases.
 */
function toBlindEntry(entry: ChallengeEntry) {
  return {
    id: entry.id,
    userId: '',
    username: null,
    imageUrl: entry.imageUrl,
    modelUrl: null,
    modelFilename: null,
    notes: null,
    voteCount: 0,
    submittedAt: entry.submittedAt,
  };
}
