import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { ApiException } from './api-exception';
import { rateLimitMetrics } from '../security/rate-limit.metrics';

interface ErrorEnvelope {
  statusCode: number;
  error: string;
  message: string;
  details: Record<string, string[]> | null;
  requestId: string;
}

function fieldErrors(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    details[key] = [...(details[key] ?? []), issue.message];
  }
  return details;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HttpError');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();
    const requestId = request.id ?? randomUUID();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Something went wrong. Please try again.';
    let details: Record<string, string[]> | null = null;
    let retryAfter: number | undefined;

    if (exception instanceof ApiException) {
      status = exception.getStatus();
      code = exception.code;
      message = exception.message;
      details = exception.details ?? null;
      retryAfter = exception.retryAfterSeconds;
    } else if (exception instanceof ZodError) {
      status = HttpStatus.BAD_REQUEST;
      code = 'VALIDATION_FAILED';
      message = 'Please check the highlighted fields.';
      details = fieldErrors(exception);
    } else if (exception instanceof ThrottlerException) {
      rateLimitMetrics.record();
      status = HttpStatus.TOO_MANY_REQUESTS;
      code = 'RATE_LIMITED';
      message = 'Too many requests. Please wait a moment and try again.';
      retryAfter = 60;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const record = body as Record<string, unknown>;
        message = typeof record.message === 'string' ? record.message : message;
        if (Array.isArray(record.message)) message = record.message.join('. ');
        const codeCandidate = typeof record.error === 'string' ? record.error : undefined;
        code = codeCandidate ? codeCandidate.toUpperCase().replace(/\s+/g, '_') : `HTTP_${status}`;
        if (code === 'BAD_REQUEST' && status === 400) code = 'VALIDATION_FAILED';
      }
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled error on ${request.method} ${request.url}: ${exception.message}`, exception.stack);
    } else {
      this.logger.error(`Unknown exception on ${request.method} ${request.url}`);
    }

    if (status >= 500) {
      this.logger.error(`[${requestId}] ${request.method} ${request.url} -> ${status} ${code}`);
    }

    if (retryAfter) response.setHeader('Retry-After', String(retryAfter));
    if (status === 413) {
      code = 'UPLOAD_TOO_LARGE';
      message = 'That file is too large.';
    }
    if (status === 415) {
      code = 'UPLOAD_INVALID';
      message = 'Unsupported file type.';
    }

    const body: ErrorEnvelope = { statusCode: status, error: code, message, details, requestId };
    response.status(status).json(body);
  }
}
