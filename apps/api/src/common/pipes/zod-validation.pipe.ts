import { Injectable, PipeTransform } from '@nestjs/common';
import { ZodError, type ZodSchema } from 'zod';
import { ApiException } from '../http/api-exception';

export function zodIssues(error: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    details[key] = [...(details[key] ?? []), issue.message];
  }
  return details;
}

/**
 * Validates and narrows a request payload with the exact Zod schema the browser
 * uses, so client and server rules cannot drift apart.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    return parseSchema(this.schema, value);
  }
}

export function parseSchema<T>(schema: ZodSchema<T>, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ApiException({
        code: 'VALIDATION_FAILED',
        message: 'Please check the highlighted fields.',
        status: 400,
        details: zodIssues(error),
      });
    }
    throw error;
  }
}

export const zodPipe = <T>(schema: ZodSchema<T>) => new ZodValidationPipe(schema);
