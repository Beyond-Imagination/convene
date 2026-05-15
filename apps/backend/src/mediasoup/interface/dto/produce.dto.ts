import { IsDefined, IsIn, IsObject, IsString, Length, MaxLength } from 'class-validator';

import {
  MEDIA_TYPES,
  type MediaType,
  type ProduceRequest,
} from '@migration/shared-interfaces';

import { MeetingCode } from '@/meeting/domain/value-objects';

const TRANSPORT_ID_MAX = 64;

export class ProduceDto implements ProduceRequest {
  @IsString()
  @Length(MeetingCode.LENGTH, MeetingCode.LENGTH)
  code!: string;

  @IsString()
  @MaxLength(TRANSPORT_ID_MAX)
  transportId!: string;

  @IsIn(['audio', 'video'])
  kind!: 'audio' | 'video';

  @IsIn(MEDIA_TYPES as unknown as string[])
  source!: MediaType;

  @IsDefined()
  @IsObject()
  rtpParameters!: unknown;
}
