import { type CreateMeetingRequest, type Source,SOURCES } from '@convene/shared-interfaces';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

import { ExternalReferenceDto } from './external-reference.dto';

/** 회의 제목 최대 길이. */
const TITLE_MAX = 100;

/**
 * POST /meetings 요청 본문 DTO. shared-interfaces.CreateMeetingRequest를
 * implements해서 wire format 단일 진실원과 일치를 강제한다.
 */
export class CreateMeetingDto implements CreateMeetingRequest {
  @IsIn(SOURCES as readonly string[])
  source!: Source;

  @IsOptional()
  @ValidateNested()
  @Type(() => ExternalReferenceDto)
  externalReference?: ExternalReferenceDto;

  @IsOptional()
  @IsString()
  @MaxLength(TITLE_MAX)
  title?: string;
}
