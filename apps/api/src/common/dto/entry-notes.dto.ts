import { SUBMISSION_NOTES_MAX_LENGTH } from '@bb/shared';
import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The optional note an artist attaches to an entry.
 *
 * Shared by both contest kinds, because both accept the same field and a limit
 * enforced on one and not the other is not a limit.
 *
 * This exists because the field had no validation at all. Both upload endpoints
 * typed the body as `{ notes?: string }` — a plain type annotation, which
 * `ValidationPipe` cannot see, so nothing checked the length, the type, or
 * whether it was a string in the first place. `SUBMISSION_NOTES_MAX_LENGTH` was
 * sitting in the shared constants documenting a 500-character cap that no code
 * had ever applied, which is precisely the failure the unused-export check was
 * added to catch: a limit that is shared, consistent, and enforced nowhere.
 */
export class EntryNotesDto {
  @IsOptional()
  @IsString()
  @MaxLength(SUBMISSION_NOTES_MAX_LENGTH)
  notes?: string;
}
