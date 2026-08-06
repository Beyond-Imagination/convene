import {
  type ChatMessage,
  type CreateMeetingRequest,
  type ExternalReferencePayload,
  type JoinMeetingMessage,
  type LeaveMeetingMessage,
  MEETING_TYPES,
  type MeetingType,
  type Source,
  SOURCES,
} from '@convene/shared-interfaces';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { MeetingCode } from '@/meeting/domain/value-objects/meeting-code';

const TITLE_MAX = 100;
const NICKNAME_MAX = 40;
const TEXT_MIN = 1;
const TEXT_MAX = 1000;

/** 회의 code를 싣는 WS 페이로드들의 공통 검증(class-validator 메타데이터는 상속된다). */
class MeetingScopedDto {
  @IsString()
  @Length(MeetingCode.LENGTH, MeetingCode.LENGTH)
  code!: string;
}

/**
 * v1.0.0에서는 모든 필드가 optional이지만 들어오면 비어 있지 않은 문자열이어야 한다.
 */
export class ExternalReferenceDto implements ExternalReferencePayload {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  issueId?: string;
}

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

export class JoinMeetingDto extends MeetingScopedDto implements JoinMeetingMessage {
  @IsString()
  @Length(1, NICKNAME_MAX)
  nickname!: string;
}

export class LeaveMeetingDto extends MeetingScopedDto implements LeaveMeetingMessage {}

export class ChatDto extends MeetingScopedDto implements ChatMessage {
  @IsString()
  @Length(TEXT_MIN, TEXT_MAX)
  text!: string;
}
