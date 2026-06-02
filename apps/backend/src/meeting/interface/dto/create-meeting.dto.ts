import { type CreateMeetingRequest, type Source,SOURCES } from '@migration/shared-interfaces';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, ValidateNested } from 'class-validator';

import { ExternalReferenceDto } from './external-reference.dto';

/**
 * POST /meetings 요청 본문 DTO. shared-interfaces.CreateMeetingRequest를
 * implements해서 wire format 단일 진실원과 일치를 강제한다 (CLAUDE.md hard rule 2).
 */
export class CreateMeetingDto implements CreateMeetingRequest {
  @IsIn(SOURCES as readonly string[])
  source!: Source;

  @IsOptional()
  @ValidateNested()
  @Type(() => ExternalReferenceDto)
  externalReference?: ExternalReferenceDto;
}
