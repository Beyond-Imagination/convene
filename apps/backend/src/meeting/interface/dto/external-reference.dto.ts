import type { ExternalReferencePayload } from '@convene/shared-interfaces';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * v1.0.0에서는 모든 필드가 optional이지만 들어오면 비어 있지 않은 문자열이어야 한다.
 */
export class ExternalReferenceDto implements ExternalReferencePayload {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  issueId?: string;
}
