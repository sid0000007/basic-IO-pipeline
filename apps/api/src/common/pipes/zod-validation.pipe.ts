import { BadRequestException, PipeTransform } from '@nestjs/common';

interface SafeParseSuccess<T> {
  success: true;
  data: T;
}

interface SafeParseFailure {
  success: false;
  error: {
    issues: ReadonlyArray<{
      path: ReadonlyArray<PropertyKey>;
      message: string;
    }>;
  };
}

type SafeParseResult<T> = SafeParseSuccess<T> | SafeParseFailure;

// Structural shape matching Zod schemas without importing zod.
// Lets us keep all real zod usage inside packages/types per the global rule.
export interface ZodLikeSchema<T> {
  safeParse(input: unknown): SafeParseResult<T>;
}

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodLikeSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        issues: result.error.issues.map((i) => ({
          path: i.path,
          message: i.message,
        })),
      });
    }
    return result.data;
  }
}
