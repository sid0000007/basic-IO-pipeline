import { Body } from '@nestjs/common';
import { ZodValidationPipe, type ZodLikeSchema } from '../pipes/zod-validation.pipe';

export function ZodBody<T>(schema: ZodLikeSchema<T>): ParameterDecorator {
  return Body(new ZodValidationPipe(schema));
}
