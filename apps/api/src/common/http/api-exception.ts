import { HttpException, HttpStatus } from '@nestjs/common';

export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_SUSPENDED'
  | 'EMAIL_NOT_VERIFIED'
  | 'MFA_REQUIRED'
  | 'MFA_INVALID'
  | 'FORBIDDEN'
  | 'CSRF_FAILED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'UPLOAD_INVALID'
  | 'UPLOAD_TOO_LARGE'
  | 'OCR_UNAVAILABLE'
  | 'QR_DECODE_FAILED'
  | 'SCAN_FAILED'
  | 'PROVIDER_UNAVAILABLE'
  | 'UNSAFE_URL'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'INTERNAL_ERROR';

export interface ApiExceptionOptions {
  code: ErrorCode;
  message: string;
  status?: HttpStatus;
  details?: Record<string, string[]> | null;
  retryAfterSeconds?: number;
}

/**
 * Single application error type so the HTTP layer always emits the documented
 * error envelope and callers never receive framework-specific shapes.
 */
export class ApiException extends HttpException {
  readonly code: ErrorCode;
  readonly details?: Record<string, string[]> | null;
  readonly retryAfterSeconds?: number;

  constructor(options: ApiExceptionOptions) {
    super(
      {
        statusCode: options.status ?? HttpStatus.BAD_REQUEST,
        error: options.code,
        message: options.message,
        details: options.details ?? null,
      },
      options.status ?? HttpStatus.BAD_REQUEST,
    );
    this.code = options.code;
    this.details = options.details ?? null;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  static badRequest(message: string, details?: Record<string, string[]>): ApiException {
    return new ApiException({ code: 'VALIDATION_FAILED', message, status: HttpStatus.BAD_REQUEST, details });
  }

  static unauthorized(message = 'Sign in to continue', code: ErrorCode = 'UNAUTHENTICATED'): ApiException {
    return new ApiException({ code, message, status: HttpStatus.UNAUTHORIZED });
  }

  static forbidden(message = 'You do not have access to this resource', code: ErrorCode = 'FORBIDDEN'): ApiException {
    return new ApiException({ code, message, status: HttpStatus.FORBIDDEN });
  }

  static notFound(message = 'Resource not found'): ApiException {
    return new ApiException({ code: 'NOT_FOUND', message, status: HttpStatus.NOT_FOUND });
  }

  static conflict(message: string, code: ErrorCode = 'CONFLICT'): ApiException {
    return new ApiException({ code, message, status: HttpStatus.CONFLICT });
  }

  static unavailable(message: string, code: ErrorCode = 'DEPENDENCY_UNAVAILABLE'): ApiException {
    return new ApiException({ code, message, status: HttpStatus.SERVICE_UNAVAILABLE });
  }
}
