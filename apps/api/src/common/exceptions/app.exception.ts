import { HttpException, HttpStatus } from '@nestjs/common';
import { ApiErrorCode } from '@bb/shared';

/**
 * Domain exception carrying a machine-readable code alongside the HTTP status.
 *
 * The frontend branches on `code`, never on the message text, so copy can be
 * rewritten or localised without breaking client behaviour.
 */
export class AppException extends HttpException {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    status: HttpStatus,
    readonly details?: Record<string, string[]>,
  ) {
    super({ code, message, details }, status);
  }

  static notFound(resource: string): AppException {
    return new AppException(
      ApiErrorCode.NOT_FOUND,
      `${resource} not found`,
      HttpStatus.NOT_FOUND,
    );
  }

  static conflict(message: string, details?: Record<string, string[]>): AppException {
    return new AppException(ApiErrorCode.CONFLICT, message, HttpStatus.CONFLICT, details);
  }

  static forbidden(message = 'You do not have permission to perform this action'): AppException {
    return new AppException(ApiErrorCode.FORBIDDEN, message, HttpStatus.FORBIDDEN);
  }

  static unauthorized(
    code: ApiErrorCode = ApiErrorCode.UNAUTHORIZED,
    message = 'Authentication required',
  ): AppException {
    return new AppException(code, message, HttpStatus.UNAUTHORIZED);
  }

  /**
   * Deliberately vague and identical for "unknown email" and "wrong password" —
   * a distinguishable response turns the login endpoint into an account oracle.
   */
  static invalidCredentials(): AppException {
    return new AppException(
      ApiErrorCode.INVALID_CREDENTIALS,
      'Invalid email or password',
      HttpStatus.UNAUTHORIZED,
    );
  }
}
