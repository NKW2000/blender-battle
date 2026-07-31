import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Interval } from '@nestjs/schedule';
import { RoomStatus } from '@bb/shared';
import { Repository } from 'typeorm';

import { RedisService } from '@/modules/redis/redis.service';

import { Room } from './entities/room.entity';
import { RoomsService } from './rooms.service';

/**
 * Drives every room transition whose trigger is a clock rather than a request.
 *
 * The reason this exists at all: a phase must end even when nobody is looking.
 * If the modelling window closed only when someone loaded the page, a room whose
 * players all closed their tabs would sit open forever, and whoever opened it
 * first would decide when the deadline was.
 *
 * The lock makes it safe to run several API instances — every one of them ticks,
 * but only the holder does the work, so a room is never advanced twice.
 */
@Injectable()
export class RoomSchedulerService {
  private readonly logger = new Logger(RoomSchedulerService.name);
  private static readonly LOCK_KEY = 'lock:rooms:sweep';

  constructor(
    @InjectRepository(Room) private readonly rooms: Repository<Room>,
    private readonly roomsService: RoomsService,
    private readonly redis: RedisService,
  ) {}

  @Interval(1000)
  async sweep(): Promise<void> {
    await this.withLock(async () => {
      const due = await this.findDueRooms();

      for (const room of due) {
        try {
          if (room.status === RoomStatus.DRAWING) {
            // Reveal finished; the modelling clock starts.
            await this.rooms
              .createQueryBuilder()
              .update(Room)
              .set({ status: RoomStatus.ACTIVE })
              .where('id = :id AND status = :from', { id: room.id, from: RoomStatus.DRAWING })
              .execute();
            continue;
          }

          if (room.status === RoomStatus.ACTIVE) {
            // Eliminates non-submitters, decides ranked, opens the ballot.
            await this.roomsService.closeSubmissions(room.id);
            continue;
          }

          if (room.status === RoomStatus.VOTING || room.status === RoomStatus.RUNOFF) {
            await this.roomsService.finalise(room.id);
          }
        } catch (error) {
          // One malformed room must not stall every other room in the sweep.
          this.logger.error(
            `Failed to advance room ${room.id}: ${(error as Error).message}`,
          );
        }
      }
    });
  }

  /** Rooms whose current phase deadline has elapsed. Index-backed. */
  private async findDueRooms(): Promise<Room[]> {
    return this.rooms
      .createQueryBuilder('room')
      .where(
        `(room.status = :drawing AND room.starts_at <= now())
          OR (room.status = :active AND room.ends_at <= now())
          OR (room.status IN (:...voting) AND room.voting_ends_at <= now())`,
        {
          drawing: RoomStatus.DRAWING,
          active: RoomStatus.ACTIVE,
          voting: [RoomStatus.VOTING, RoomStatus.RUNOFF],
        },
      )
      .orderBy('room.created_at', 'ASC')
      .take(100)
      .getMany();
  }

  /**
   * Short TTL, roughly one tick. If an instance dies holding the lock, the next
   * tick elsewhere picks the work up rather than rooms freezing until a restart.
   */
  private async withLock(work: () => Promise<void>): Promise<void> {
    const token = Math.random().toString(36).slice(2);
    const acquired = await this.redis.client.set(
      RoomSchedulerService.LOCK_KEY,
      token,
      'PX',
      3000,
      'NX',
    );

    if (!acquired) return;

    try {
      await work();
    } finally {
      // Only release a lock still held by this tick — a slow sweep may have let
      // the TTL lapse and another instance may legitimately own it now.
      const current = await this.redis.client.get(RoomSchedulerService.LOCK_KEY);
      if (current === token) await this.redis.client.del(RoomSchedulerService.LOCK_KEY);
    }
  }
}
