import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { ApiSuccess } from '@bb/shared';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export const RESPONSE_MESSAGE_KEY = 'response:message';

/** Sets the envelope's human-readable `message` for a handler. */
export const ResponseMessage = (message: string) => SetMetadata(RESPONSE_MESSAGE_KEY, message);

/**
 * Wraps every successful handler return value in the standard envelope.
 *
 * Controllers return plain data objects and stay unaware of the envelope, so the
 * response shape is defined in exactly one place and cannot drift per endpoint.
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiSuccess<T>> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccess<T>> {
    const message =
      this.reflector.getAllAndOverride<string>(RESPONSE_MESSAGE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? '';

    return next.handle().pipe(
      map((data) => ({
        success: true as const,
        message,
        data,
      })),
    );
  }
}
