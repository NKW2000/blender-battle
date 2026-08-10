import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, type CursorQuery } from '@bb/shared';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Shared query DTO for every cursor-paginated list endpoint.
 *
 * `implements CursorQuery` rather than merely resembling it: the shape is
 * declared in the shared package so the front end can build the same query, and
 * without this the two could drift apart while both looking correct.
 */
export class CursorQueryDto implements CursorQuery {
  @IsOptional()
  @IsString()
  cursor?: string;

  /** Capped server-side; a client asking for 10_000 rows gets MAX_PAGE_SIZE. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  limit: number = DEFAULT_PAGE_SIZE;
}
