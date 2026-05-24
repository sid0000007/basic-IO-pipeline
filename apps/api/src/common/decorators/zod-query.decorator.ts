import { Query } from '@nestjs/common';
import { ZodValidationPipe, type ZodLikeSchema } from '../pipes/zod-validation.pipe';

export function ZodQuery<T>(schema: ZodLikeSchema<T>): ParameterDecorator {
  return Query(new ZodValidationPipe(schema));
}
