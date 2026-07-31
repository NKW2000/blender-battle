import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  USERNAME_PATTERN,
} from '@bb/shared';
import { z } from 'zod';

/**
 * Client-side form schemas.
 *
 * These exist for immediate feedback while typing — nothing more. The backend
 * re-validates every field independently with class-validator and is the only
 * authority on what is acceptable. The shared constants above are what keep the
 * two in agreement; the rules themselves are not shared, because the two sides
 * legitimately differ (the server also checks uniqueness, which a form cannot).
 */

export const loginSchema = z.object({
  email: z.string().min(1, 'Enter your email').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

export const registerSchema = z.object({
  username: z
    .string()
    .min(USERNAME_MIN_LENGTH, `At least ${USERNAME_MIN_LENGTH} characters`)
    .max(USERNAME_MAX_LENGTH, `At most ${USERNAME_MAX_LENGTH} characters`)
    .regex(
      USERNAME_PATTERN,
      'Letters, numbers, underscores and hyphens. Must start and end with a letter or number.',
    ),
  email: z.string().min(1, 'Enter your email').email('Enter a valid email address'),
  password: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `At least ${PASSWORD_MIN_LENGTH} characters`)
    .max(PASSWORD_MAX_LENGTH, `At most ${PASSWORD_MAX_LENGTH} characters`),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
