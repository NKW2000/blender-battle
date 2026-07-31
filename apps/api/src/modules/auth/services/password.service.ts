import { compare, hash } from '@node-rs/bcrypt';
import { Injectable } from '@nestjs/common';

/**
 * bcrypt via @node-rs (prebuilt Rust binding) rather than the classic `bcrypt`
 * package: no node-gyp toolchain required on Windows dev machines, and ~2-3x the
 * throughput of the pure-JS `bcryptjs` fallback at the same cost factor.
 */
@Injectable()
export class PasswordService {
  /**
   * Cost 12: roughly 250ms on current server hardware. High enough to make
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
