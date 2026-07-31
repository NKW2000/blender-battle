import { RoomParticipantStatus, RoomStatus } from '@bb/shared';

import { ChallengeMapper } from '@/modules/challenges/challenges.mapper';

import type { Room } from './entities/room.entity';

/**
 * Room → API shape.
 *
 * Two things are deliberately withheld:
 *
 *  - the join code, except to the host. It is the only access control a private
 *    room has, so handing it to every member would make "private" meaningless
 *    the moment one of them shared a screenshot.
 *  - the challenge, until the room has actually started. Before that it does not
 *    exist server-side either, but the guard is explicit so a future change
 *    cannot leak a pre-drawn brief into a lobby payload.
 */
export class RoomMapper {
  static summary(room: Room) {
    const seated = (room.participants ?? []).filter(
      (participant) => participant.status !== RoomParticipantStatus.LEFT,
    );

    return {
      id: room.id,
      name: room.name,
      status: room.status,
      hostId: room.hostId,
      hostUsername: room.host?.username ?? null,
      category: room.category ? { id: room.category.id, name: room.category.name } : null,
      difficulty: room.difficulty,
      playerCount: seated.length,
      maxPlayers: room.maxPlayers,
      durationSeconds: room.durationSeconds,
      createdAt: room.createdAt.toISOString(),
    };
  }

  static detail(room: Room, viewerId: string) {
    const revealed = room.status !== RoomStatus.LOBBY;

    return {
      ...RoomMapper.summary(room),
      // Host only: the code is the room's entire access control, so handing it
      // to every member would make it meaningless the moment one shared a
      // screenshot.
      joinCode: room.hostId === viewerId ? room.joinCode : null,
      challenge: revealed && room.challenge ? ChallengeMapper.summary(room.challenge) : null,
      startsAt: room.startsAt?.toISOString() ?? null,
      endsAt: room.endsAt?.toISOString() ?? null,
      votingEndsAt: room.votingEndsAt?.toISOString() ?? null,
      completedAt: room.completedAt?.toISOString() ?? null,
      // Absolute deadlines plus server time: a client with a skewed clock still
      // computes the same remaining duration as everyone else.
      serverNow: new Date().toISOString(),
      isHost: room.hostId === viewerId,
      participants: (room.participants ?? [])
        .filter((participant) => participant.status !== RoomParticipantStatus.LEFT)
        .map((participant) => ({
          userId: participant.userId,
          username: participant.user?.username ?? '',
          avatarUrl: participant.user?.avatarUrl ?? null,
          status: participant.status,
          // Placement and likes are only meaningful once the room is over, and
          // exposing a running like count during voting would let people watch
          // the race and pile onto the leader.
          likeCount: room.status === RoomStatus.COMPLETED ? participant.likeCount : null,
          placement: participant.placement,
          result: participant.result,
          xpAwarded: participant.xpAwarded,
        })),
    };
  }
}
