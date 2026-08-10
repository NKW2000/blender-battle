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
import { ApiErrorCode, Role, SUBMISSION_IMAGE_MAX_BYTES } from '@bb/shared';
import { IsDateString, IsInt, IsUUID, Max, Min } from 'class-validator';

import { CurrentUser, OptionalAuth, Public, Roles } from '@/common/decorators';
import { EntryNotesDto } from '@/common/dto/entry-notes.dto';
import { AppException } from '@/common/exceptions/app.exception';
import { ResponseMessage } from '@/common/interceptors/response.interceptor';
import type { AuthenticatedUser } from '@/common/types/authenticated-user';
import { CloudinaryService } from '@/modules/uploads/cloudinary.service';

import { entriesForPhase, toEntry } from './challenge-entries.mapper';
import { ChallengeEventsService } from './challenge-events.service';
import { ChallengeMapper } from './challenges.mapper';
import type { Challenge } from './entities/challenge.entity';

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

  /**
   * One event.
   *
   * `OptionalAuth` rather than authenticated: an event link is the most
   * shareable thing this application produces, and it used to 401 for anyone
   * not signed in — so a link posted anywhere led a stranger to a redirect, and
   * a crawler to nothing at all. The signed-out view is the same page minus the
   * two fields that are about *you*.
   *
   * Nothing is loosened by this. What each phase is allowed to reveal is
   * decided by `entriesForPhase`, which does not consider the viewer at all —
   * during voting the entries are blind for everybody, signed in or not.
   */
  @Public()
  @OptionalAuth()
  @Get(':id')
  async detail(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ) {
    const challenge = await this.events.findEventOrFail(id);
    const phase = this.events.phaseOf(challenge);
    const entries = await this.events.listEntries(id);

    return {
      ...this.toEvent(challenge),
      myEntryId: user ? (entries.find((entry) => entry.userId === user.id)?.id ?? null) : null,
      myVoteEntryId: user ? await this.events.myVote(id, user.id) : null,
      // Enforced here rather than trusted to the UI. See the mapper for what
      // each phase is allowed to reveal and why.
      entries: entriesForPhase(entries, phase),
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
        { name: 'workspace', maxCount: 1 },
      ],
      { limits: { fileSize: SUBMISSION_IMAGE_MAX_BYTES } },
    ),
  )
  @ResponseMessage('Entry submitted')
  async enter(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFiles() files: { image?: Express.Multer.File[]; workspace?: Express.Multer.File[] },
    @Body() body: EntryNotesDto,
  ) {
    await this.events.assertOpenForEntry(id);

    // `files` is undefined entirely on a non-multipart request, which a plain
    // property read would turn into a 500.
    const image = files?.image?.[0];
    const workspace = files?.workspace?.[0];

    if (!image || !workspace) {
      throw new AppException(
        ApiErrorCode.VALIDATION_FAILED,
        'Both a final render and a workspace photo are required',
        400,
      );
    }

    // Render first: if the workspace shot is the wrong size, the render is
    // already stored, so upload the workspace second and let its own failure
    // clean up after itself. The render is overwritten on the next valid submit.
    const uploadedImage = await this.uploads.uploadEntryImage(image, { scope: 'challenges', id }, 'renders');
    const uploadedWorkspace = await this.uploads.uploadEntryImage(workspace, { scope: 'challenges', id }, 'workspace');

    const entry = await this.events.submitEntry(
      id,
      user.id,
      {
        imageUrl: uploadedImage.url,
        workspacePhotoUrl: uploadedWorkspace.url,
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

