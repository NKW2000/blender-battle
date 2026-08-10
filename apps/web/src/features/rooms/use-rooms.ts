'use client';

import type {
  Difficulty,
  RoomParticipantStatus,
  RoomStatus,
  RoomVisibility,
} from '@bb/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type ApiError } from '@/lib/api/client';
import { tokenStore } from '@/lib/api/token-store';

export interface RoomSummary {
  id: string;
  name: string;
  status: RoomStatus;
  hostId: string;
  hostUsername: string | null;
  category: { id: string; name: string } | null;
  difficulty: Difficulty | null;
  playerCount: number;
  maxPlayers: number;
  durationSeconds: number;
  createdAt: string;
}

export interface RoomParticipantView {
  userId: string;
  username: string;
  avatarUrl: string | null;
  status: RoomParticipantStatus;
  likeCount: number | null;
  placement: number | null;
  result: string | null;
  xpAwarded: number;
}

export interface RoomDetail extends RoomSummary {
  joinCode: string | null;
  challenge: {
    id: string;
    title: string;
    slug: string;
    difficulty: Difficulty;
    estimatedMinutes: number;
    category: { id: string; name: string };
  } | null;
  startsAt: string | null;
  endsAt: string | null;
  votingEndsAt: string | null;
  completedAt: string | null;
  serverNow: string;
  isHost: boolean;
  participants: RoomParticipantView[];
}

export interface BallotEntry {
  submissionId: string;
  imageUrl: string;
  index: number;
  liked: boolean;
  opensAt: string;
  closesAt: string;
}

export interface Ballot {
  round: number;
  roomId: string;
  referenceImageUrl: string | null;
  challengeTitle: string | null;
  secondsPerEntry: number;
  startedAt: string;
  serverNow: string;
  votingEndsAt: string | null;
  entries: BallotEntry[];
}

export const roomKeys = {
  active: ['rooms', 'active'] as const,
  browse: ['rooms', 'browse'] as const,
  detail: (id: string) => ['rooms', 'detail', id] as const,
  ballot: (id: string) => ['rooms', 'ballot', id] as const,
};

export function useActiveRoom() {
  return useQuery({
    queryKey: roomKeys.active,
    queryFn: () => api.get<RoomSummary | null>('/rooms/active'),
  });
}

/**
 * One room, polled while it is live.
 *
 * Every phase change is driven by a server deadline, so the client has to ask
 * rather than assume — a room moves from drawing to active, and from active to
 * voting, whether or not this tab is doing anything.
 */
export function useRoom(id: string | null) {
  return useQuery({
    queryKey: roomKeys.detail(id ?? ''),
    queryFn: () => api.get<RoomDetail>(`/rooms/${id}`),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'completed' || status === 'cancelled' ? false : 3_000;
    },
  });
}

/**
 * Open lobbies anyone may join.
 *
 * Polled rather than cached hard: a lobby fills up and starts within minutes,
 * and a stale list sends people at rooms that are already running.
 */
export function usePublicRooms() {
  return useQuery({
    queryKey: roomKeys.browse,
    queryFn: () => api.get<RoomSummary[]>('/rooms'),
    refetchInterval: 15_000,
  });
}

export function useCreateRoom() {
  const queryClient = useQueryClient();

  return useMutation<
    RoomDetail,
    ApiError,
    {
      name: string;
      categoryId?: string;
      difficulty?: Difficulty;
      maxPlayers?: number;
      /** Listed in the browse list, or reachable only by code. */
      visibility?: RoomVisibility;
      /** ISO instant — already converted from the host's local date/time pick. */
      endsAt: string;
    }
  >({
    mutationFn: (dto) => api.post<RoomDetail>('/rooms', dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: roomKeys.active });
      void queryClient.invalidateQueries({ queryKey: roomKeys.browse });
    },
  });
}

export function useJoinRoom() {
  const queryClient = useQueryClient();

  return useMutation<RoomDetail, ApiError, { roomId?: string; code?: string }>({
    mutationFn: (dto) => api.post<RoomDetail>('/rooms/join', dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: roomKeys.active });
    },
  });
}

export function useStartRoom() {
  const queryClient = useQueryClient();

  return useMutation<RoomDetail, ApiError, string>({
    mutationFn: (roomId) => api.post<RoomDetail>(`/rooms/${roomId}/start`),
    onSuccess: (room) => {
      void queryClient.invalidateQueries({ queryKey: roomKeys.detail(room.id) });
    },
  });
}

export function useLeaveRoom() {
  const queryClient = useQueryClient();

  return useMutation<void, ApiError, string>({
    mutationFn: (roomId) => api.delete(`/rooms/${roomId}/leave`),
    onSuccess: (_data, roomId) => {
      void queryClient.invalidateQueries({ queryKey: roomKeys.active });
      // The roster — and possibly the host, or the room's whole status — changed
      // for everyone still in it, including this tab until it navigates away.
      void queryClient.invalidateQueries({ queryKey: roomKeys.detail(roomId) });
    },
  });
}

/**
 * Upload an entry: the final render and the workspace shot.
 *
 * Sent as multipart through the API rather than browser-direct to the CDN: the
 * deadline has to be checked server-side, and an unsigned upload preset would be
 * a public write endpoint into the storage account.
 */
export function useSubmitEntry(roomId: string) {
  const queryClient = useQueryClient();

  return useMutation<
    { id: string; imageUrl: string; workspacePhotoUrl: string | null },
    ApiError,
    { image: File; workspace: File; notes?: string }
  >({
    mutationFn: async ({ image, workspace, notes }) => {
      const form = new FormData();
      form.append('image', image);
      form.append('workspace', workspace);
      if (notes) form.append('notes', notes);

      // Bypasses the JSON client: fetch must set the multipart boundary itself,
      // so no Content-Type header is provided here.
      const base = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
      const response = await fetch(`${base}/rooms/${roomId}/submit`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tokenStore.getAccessToken() ?? ''}` },
        body: form,
      });

      const payload = await response.json();
      if (!response.ok || !payload.success) {
        throw Object.assign(new Error(payload.message ?? 'Upload failed'), {
          status: response.status,
        });
      }
      return payload.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: roomKeys.detail(roomId) });
    },
  });
}

export function useBallot(roomId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: roomKeys.ballot(roomId ?? ''),
    queryFn: () => api.get<Ballot>(`/rooms/${roomId}/ballot`),
    enabled: Boolean(roomId) && enabled,
    // The order and the clock are fixed server-side on first open, so refetching
    // would only re-fetch the same thing — and must not restart the timer.
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}

export function useLikeEntry(roomId: string) {
  return useMutation<
    { submissionId: string; liked: boolean },
    ApiError,
    { submissionId: string; liked: boolean }
  >({
    mutationFn: ({ submissionId, liked }) =>
      liked
        ? api.post(`/rooms/${roomId}/ballot/${submissionId}/like`)
        : api.delete(`/rooms/${roomId}/ballot/${submissionId}/like`),
  });
}
