import {
  type CreateMeetingRequest,
  MEETING_TYPES,
  type MeetingType,
  type Source,
  SOURCES,
} from '@convene/shared-interfaces';
import { Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

import { ExternalReferenceDto } from './external-reference.dto';

const TITLE_MAX = 100;

export class CreateMeetingDto implements CreateMeetingRequest {
  @IsIn(SOURCES as readonly string[])
  source!: Source;

  @IsOptional()
  @IsIn(MEETING_TYPES as readonly string[])
  meetingType?: MeetingType;

  @IsOptional()
  @ValidateNested()
  @Type(() => ExternalReferenceDto)
  externalReference?: ExternalReferenceDto;

  @IsOptional()
  @IsString()
  @MaxLength(TITLE_MAX)
  title?: string;
}
