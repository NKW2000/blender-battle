import {
  ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
  LoggerService,
} from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { ApiErrorCode, type ApiFailure } from '@bb/shared';
import type { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

import { AppException } from '../exceptions/app.exception';

interface PostgresError {
  code?: string;
  constraint?: string;
  detail?: string;
}

/**
 * Terminal error handler. Guarantees two things:
 *  1. every failure leaves the process in the same envelope shape, and
 *  2. internal details (stack traces, SQL, constraint names) never reach a client.
 *
 * Unexpected errors are logged in full with a requestId; the client receives only
 * that id, which is enough to correlate a bug report with the server log.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(@Inject(WINSTON_MODULE_NEST_PROVIDER) private readonly logger: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request.headers['x-request-id'] as string) ?? crypto.randomUUID();

    const { status, body } = this.toFailure(exception, requestId);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        JSON.stringify({
          requestId,
          method: request.method,
          path: request.url,
          status,
          error: exception instanceof Error ? exception.message : String(exception),
          stack: exception instanceof Error ? exception.stack : undefined,
        }),
      );
    } else {
      this.logger.warn(
        JSON.stringify({
          requestId,
          method: request.method,
          path: request.url,
          status,
          code: body.error.code,
        }),
      );
    }

    response.status(status).json(body);
  }

  private toFailure(
    exception: unknown,
    requestId: string,
  ): { status: number; body: ApiFailure } {
    if (exception instanceof AppException) {
      const payload = exception.getResponse() as {
        code: ApiErrorCode;
        message: string;
        details?: Record<string, string[]>;
      };
      return {
        status: exception.getStatus(),
        body: this.envelope(payload.message, payload.code, requestId, payload.details),
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const { message, details } = this.readHttpPayload(payload, exception.message);
      return {
        status,
        body: this.envelope(message, this.codeForStatus(status), requestId, details),
      };
    }

    if (exception instanceof QueryFailedError) {
      const driverError = exception.driverError as PostgresError;
      // 23505 = unique_violation. Surfaced as a clean 409 without echoing the
      // constraint name, which would disclose schema internals.
      if (driverError.code === '23505') {
        return {
          status: HttpStatus.CONFLICT,
          body: this.envelope(
            'That value is already taken',
            ApiErrorCode.CONFLICT,
            requestId,
          ),
        };
      }
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: this.envelope(
        'An unexpected error occurred',
        ApiErrorCode.INTERNAL_ERROR,
        requestId,
      ),
    };
  }

  /** ValidationPipe produces `{ message: string[] }`; everything else is a string. */
  private readHttpPayload(
    payload: unknown,
    fallback: string,
  ): { message: string; details?: Record<string, string[]> } {
    if (typeof payload === 'string') return { message: payload };

    if (payload && typeof payload === 'object' && 'message' in payload) {
      const raw = (payload as { message: unknown }).message;
      if (Array.isArray(raw)) {
        return { message: 'Validation failed', details: { _: raw.map(String) } };
      }
      if (typeof raw === 'string') return { message: raw };
    }

    return { message: fallback };
  }

  private codeForStatus(status: number): ApiErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ApiErrorCode.VALIDATION_FAILED;
      case HttpStatus.UNAUTHORIZED:
        return ApiErrorCode.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ApiErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ApiErrorCode.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ApiErrorCode.CONFLICT;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ApiErrorCode.RATE_LIMITED;
      default:
        return ApiErrorCode.INTERNAL_ERROR;
    }
  }

  private envelope(
    message: string,
    code: ApiErrorCode,
    requestId: string,
    details?: Record<string, string[]>,
  ): ApiFailure {
    return {
      success: false,
      message,
      data: null,
      error: { code, details, requestId },
    };
  }
}
