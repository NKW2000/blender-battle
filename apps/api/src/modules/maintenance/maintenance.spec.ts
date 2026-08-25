import { ApiErrorCode } from '@bb/shared';
import { describe, expect, it, vi } from 'vitest';

import { AppException } from '@/common/exceptions/app.exception';

import { MaintenanceController } from './maintenance.controller';

/**
 * The scheduled sweeps, triggered over HTTP.
 *
 * This exists for hosts with no long-running process, where `@Interval` and
 * `@Cron` never fire. It advances contests and deletes rows, so the guard on it
 * is the point — an open endpoint here lets anyone close every live room.
 */
function makeController(secret?: string) {
  const rooms = { sweep: vi.fn(async () => undefined) };
  const events = { sweep: vi.fn(async () => undefined) };
  const tokens = { prune: vi.fn(async () => undefined) };

  const controller = new MaintenanceController(
    rooms as never,
    events as never,
    tokens as never,
    { cronSecret: secret } as never,
  );

  return { controller, rooms, events, tokens };
}

describe('the maintenance trigger', () => {
  it('runs every sweep once when the secret matches', async () => {
    const { controller, rooms, events, tokens } = makeController('s3cret');

    await expect(controller.sweep('Bearer s3cret')).resolves.toEqual({
      rooms: 'ok',
      challengeEvents: 'ok',
      tokens: 'ok',
    });

    expect(rooms.sweep).toHaveBeenCalledOnce();
    expect(events.sweep).toHaveBeenCalledOnce();
    expect(tokens.prune).toHaveBeenCalledOnce();
  });

  it('refuses a wrong secret without running anything', async () => {
    const { controller, rooms } = makeController('s3cret');

    await expect(controller.sweep('Bearer wrong!')).rejects.toMatchObject({
      code: ApiErrorCode.FORBIDDEN,
    });
    expect(rooms.sweep).not.toHaveBeenCalled();
  });

  it('refuses a secret of the wrong length rather than throwing', async () => {
    // `timingSafeEqual` throws on mismatched lengths instead of returning
    // false, so the length has to be checked first — otherwise a short guess
    // fails differently from a wrong one, which leaks the length.
    const { controller } = makeController('s3cret');

    await expect(controller.sweep('Bearer x')).rejects.toBeInstanceOf(AppException);
  });

  it('refuses when no secret is configured', async () => {
    /*
      Fails closed. An unset variable is far likelier to be an oversight than a
      decision to run maintenance unauthenticated, and refusing makes the
      oversight visible instead of quietly exposing the endpoint.
    */
    const { controller, rooms } = makeController(undefined);

    await expect(controller.sweep('Bearer anything')).rejects.toMatchObject({
      code: ApiErrorCode.FORBIDDEN,
    });
    expect(rooms.sweep).not.toHaveBeenCalled();
  });

  it('refuses a request with no authorization header at all', async () => {
    const { controller } = makeController('s3cret');
    await expect(controller.sweep()).rejects.toBeInstanceOf(AppException);
  });

  it('reports which sweep failed rather than abandoning the rest', async () => {
    /*
      Settled, not raced. A Redis blip in the token prune must not leave rooms
      sitting past their deadline, and a cron log that says only "500" cannot
      tell you which half of the work happened.
    */
    const { controller, tokens, rooms } = makeController('s3cret');
    tokens.prune.mockRejectedValueOnce(new Error('redis unavailable'));

    await expect(controller.sweep('Bearer s3cret')).resolves.toEqual({
      rooms: 'ok',
      challengeEvents: 'ok',
      tokens: 'redis unavailable',
    });
    expect(rooms.sweep).toHaveBeenCalledOnce();
  });
});
