import { Injectable } from '@nestjs/common';
import { compare, hash } from 'bcryptjs';

/**
 * bcrypt, in pure JavaScript.
 *
 * This was `@node-rs/bcrypt`, a prebuilt Rust binding, chosen for throughput and
 * for not needing a node-gyp toolchain on a Windows dev machine. It cost us a
 * deployment: a native `.node` binary cannot be bundled, and the platform build
 * failed at module load — before any request handler ran, so the only symptom
 * was a generic crash page naming nothing.
 *
 * The throughput argument turned out to be mostly stale. Measured here at cost
 * 12: 377ms native against 459ms pure-JS, so about 20% rather than the 2-3x the
 * previous note claimed. That is worth paying to delete an entire class of
 * build failure.
 *
 * The hash format is bcrypt either way, and the two implementations verify each
 * other's output — checked in both directions, including the `$2y$` prefix
 * @node-rs emits. Existing passwords keep working; there is nothing to migrate.
 */
@Injectable()
export class PasswordService {
  /**
   * Cost 12: roughly 450ms on current server hardware. High enough to make
   * offline cracking expensive, low enough that a login burst does not saturate
   * the event loop. Revisit as hardware improves.
   */
  private static readonly COST = 12;

  async hash(plaintext: string): Promise<string> {
    return hash(plaintext, PasswordService.COST);
  }

  async verify(plaintext: string, passwordHash: string): Promise<boolean> {
    return compare(plaintext, passwordHash);
  }

  /**
   * Burns roughly one hash's worth of time when the account does not exist, so a
   * "no such user" response is not measurably faster than "wrong password".
   * Without this the login endpoint leaks account existence through timing.
   */
  async burnTimingBudget(): Promise<void> {
    await hash('timing-equalisation-dummy-value', PasswordService.COST);
  }
}
