import { IsDefined, IsObject, IsString, Length, MaxLength } from 'class-validator';

import type { ConsumeRequest } from '@migration/shared-interfaces';

import { MeetingCode } from '@/meeting/domain/value-objects';

const ID_MAX = 64;

export class ConsumeDto implements ConsumeRequest {
  @IsString()
  @Length(MeetingCode.LENGTH, MeetingCode.LENGTH)
  code!: string;

  @IsString()
  @MaxLength(ID_MAX)
  transportId!: string;

  @IsString()
  @MaxLength(ID_MAX)
  producerId!: string;

  @IsDefined()
  @IsObject()
  rtpCapabilities!: unknown;
}
