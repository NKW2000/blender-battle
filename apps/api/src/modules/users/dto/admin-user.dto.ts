import { Role, UserStatus } from '@bb/shared';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';

import { CursorQueryDto } from '@/common/dto/cursor-query.dto';

export class ListUsersQueryDto extends CursorQueryDto {
  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  /** Prefix match against username/email. */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  search?: string;
}

export class UpdateUserRoleDto {
  @IsEnum(Role)
  role: Role;

  /** Recorded in the audit log; role changes must be explainable after the fact. */
  @IsString()
  @MaxLength(280)
  reason: string;
}

export class UpdateUserStatusDto {
  @IsEnum(UserStatus)
  status: UserStatus;

  /** Required for SUSPENDED, meaningless otherwise. */
  @ValidateIf((dto: UpdateUserStatusDto) => dto.status === UserStatus.SUSPENDED)
  @Type(() => Date)
  @IsDate()
  suspendedUntil?: Date;

  @IsString()
  @MaxLength(280)
  reason: string;
}
