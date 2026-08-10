import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Interval } from '@nestjs/schedule';
import { RoomStatus } from '@bb/shared';
import { Repository } from 'typeorm';

import { RedisService } from '@/modules/redis/redis.service';

import { Room } from './entities/room.entity';
import { RoomsService } from './rooms.service';

/**
 * Advances rooms that nobody is looking at.
 *
 * This used to be the only thing that moved a room between phases, on a
 * one-second tick, which made the correctness of the flagship feature depend on
 * this process being alive at a particular wall-clock instant — a bad bet on
 * any host and a losing one on a free tier that sleeps after fifteen minutes.
 *
 * `RoomsService.reconcile` now advances a room on read, so the players waiting
 * on a transition are the ones who trigger it. What remains for a scheduler is
 * the case that has no reader at all: everyone closed their tab, the deadline
 * passed, and the room needs finishing so its result is written and it stops
 * appearing as live. That is a housekeeping job, not a heartbeat, which is why
 * the interval is now ten seconds rather than one — nobody is waiting on it.
 *
 * The lock makes it safe to run several API instances: every one of them ticks,
 * but only the holder does the work.
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

  @Interval(10_000)
  async sweep(): Promise<void> {
    await this.withLock(async () => {
      const due = await this.findDueRooms();

      for (const room of due) {
        try {
          // The same path a page load takes. One implementation of "what phase
          // should this room be in", so a room advanced by the sweeper and a
          // room advanced by a reader cannot end up in different states.
          await this.roomsService.reconcile(room.id);
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
   * A few ticks' worth. If an instance dies holding the lock, the next tick
   * elsewhere picks the work up rather than rooms freezing until a restart.
   *
   * Scaled with the interval deliberately: it was three seconds against a
   * one-second tick, and leaving it there while the tick grew to ten would mean
   * any sweep lasting longer than three seconds — a batch of a hundred rooms on
   * a cold database — lost its lock while still working, letting a second
   * instance start the same batch underneath it.
   */
  private static readonly LOCK_TTL_MS = 30_000;

  private async withLock(work: () => Promise<void>): Promise<void> {
    const token = Math.random().toString(36).slice(2);
    const acquired = await this.redis.client.set(
      RoomSchedulerService.LOCK_KEY,
      token,
      'PX',
      RoomSchedulerService.LOCK_TTL_MS,
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
