import { OAuthProvider } from '@bb/shared';
import { describe, expect, it, vi } from 'vitest';

import { OAuthService } from './oauth.service';

/**
 * The OAuth CSRF state.
 *
 * It used to be a random value written to Redis and read back on the callback,
 * which made a successful sign-in depend on that row surviving the round trip.
 * When it did not — an eviction, a reconnect, a restart, a Redis that was never
 * reachable — the flow failed with "this sign-in link has expired", a message
 * that describes a missing key and explains nothing about why it went missing.
 *
 * Signed instead, so there is nothing to lose. That moves the security property
 * from "the server remembers issuing this" to "the signature proves the server
 * issued this", and these assert the second one actually holds: a forged state
 * is refused, a tampered payload is refused, and an old one is refused.
 */

const SECRET = 'refresh-secret-for-tests';

/*
  The two methods under test are private, which is correct — nothing outside the
  service should mint or trust a state. Reaching them through a structural type
  rather than an intersection with the class: intersecting a class that declares
  the same members privately collapses to `never`, so the cast has to go via
  `unknown` and describe only the shape being called.
*/
interface StateInternals {
  signState: (provider: OAuthProvider, linkUserId: string | null) => string;
  verifyState: (state: string) => { provider: OAuthProvider; linkUserId: string | null };
  stateSignature: (body: string) => string;
}

function makeService(): StateInternals {
  const service = Object.create(OAuthService.prototype) as OAuthService;
  Object.assign(service, {
    config: { jwt: { refreshSecret: SECRET } },
    logger: { warn: vi.fn(), error: vi.fn(), log: vi.fn() },
  });
  return service as unknown as StateInternals;
}

describe('signed OAuth state', () => {
  it('round-trips the provider and the account being linked', () => {
    const service = makeService();
    const state = service.signState(OAuthProvider.DISCORD, 'user-1');

    expect(service.verifyState(state)).toEqual({
      provider: OAuthProvider.DISCORD,
      linkUserId: 'user-1',
    });
  });

  it('carries a null link for an ordinary sign-in', () => {
    const service = makeService();
    expect(service.verifyState(service.signState(OAuthProvider.GOOGLE, null))).toEqual({
      provider: OAuthProvider.GOOGLE,
      linkUserId: null,
    });
  });

  it('issues a different state each time', () => {
    // Two sign-ins in the same second must not collide, or the replay guard
    // would refuse the second one as a repeat of the first.
    const service = makeService();
    const a = service.signState(OAuthProvider.DISCORD, null);
    const b = service.signState(OAuthProvider.DISCORD, null);
    expect(a).not.toBe(b);
  });

  it('refuses a payload edited in transit', () => {
    /*
      The attack the state exists to stop: completing the callback with a state
      that names *your* account as the one to link, so the victim's provider
      login attaches to it.
    */
    const service = makeService();
    const state = service.signState(OAuthProvider.DISCORD, null);
    const [, signature] = state.split('.');

    const forgedBody = Buffer.from(
      JSON.stringify({
        p: OAuthProvider.DISCORD,
        l: 'attacker-account',
        n: 'x',
        e: Date.now() + 60_000,
      }),
    ).toString('base64url');

    expect(() => service.verifyState(`${forgedBody}.${signature}`)).toThrow(/expired/i);
  });

  it('refuses a signature from a different secret', () => {
    const mine = makeService();
    const theirs = makeService();
    Object.assign(theirs, { config: { jwt: { refreshSecret: 'a-different-secret' } } });

    const state = theirs.signState(OAuthProvider.DISCORD, null);
    expect(() => mine.verifyState(state)).toThrow(/expired/i);
  });

  it('refuses a signature of the wrong length without throwing on the comparison', () => {
    // `timingSafeEqual` throws on mismatched lengths rather than returning
    // false, so a short signature must be rejected as a refusal, not surface as
    // an unhandled error — and not by a different code path an attacker could
    // time.
    const service = makeService();
    const [body] = service.signState(OAuthProvider.DISCORD, null).split('.');
    expect(() => service.verifyState(`${body}.short`)).toThrow(/expired/i);
  });

  it('refuses a state with no signature at all', () => {
    const service = makeService();
    expect(() => service.verifyState('just-a-body')).toThrow(/expired/i);
    expect(() => service.verifyState('')).toThrow(/expired/i);
  });

  it('refuses one that has aged out', () => {
    const service = makeService();
    const state = service.signState(OAuthProvider.DISCORD, null);

    // Eleven minutes on, against a ten-minute window.
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 11 * 60_000);
    try {
      expect(() => service.verifyState(state)).toThrow(/expired/i);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('refuses a correctly signed body that is not JSON', () => {
    // Signed by this server, so the signature passes — the parse must still
    // fail closed rather than throwing something the caller does not expect.
    const service = makeService();
    const body = Buffer.from('not json at all').toString('base64url');
    const signature = service.stateSignature(body);

    expect(() => service.verifyState(`${body}.${signature}`)).toThrow(/expired/i);
  });
});
